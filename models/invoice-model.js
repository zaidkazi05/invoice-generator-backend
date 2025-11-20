const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Item Schema
const itemSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      // required: true,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true }
);

// Payment History Schema
const paymentSchema = new mongoose.Schema(
  {
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank_transfer", "cheque", "upi", "card", "other"],
      default: "bank_transfer",
    },
    transactionId: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    updatedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client",
      },
      role: {
        type: String,
        enum: ["user", "client"],
        required: true,
      },
    },
  },
  { _id: true, timestamps: true }
);

// Status Change Log Schema
const statusLogSchema = new mongoose.Schema(
  {
    oldStatus: String,
    newStatus: String,
    changedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client",
      },
      role: {
        type: String,
        enum: ["user", "client", "system"],
        required: true,
      },
    },
    reason: String,
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Email Log Schema
const emailLogSchema = new mongoose.Schema(
  {
    emailType: {
      type: String,
      enum: [
        "invoice_sent",
        "payment_reminder",
        "payment_received",
        "status_update",
      ],
      required: true,
    },
    sentTo: {
      type: String,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["sent", "failed", "delivered", "opened"],
      default: "sent",
    },
    emailId: String, // External email service ID
    pdfGenerated: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

// Main Invoice Schema
const invoiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "sent",
        "viewed",
        "partial_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      default: "draft",
    },

    // Embedded Items Array
    items: [itemSchema],

    // Financial Calculations
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Payment tracking
    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Embedded arrays
    payments: [paymentSchema],
    statusLog: [statusLogSchema],
    emailLog: [emailLogSchema],

    // Additional fields
    notes: {
      type: String,
      trim: true,
    },
    terms: {
      type: String,
      trim: true,
    },

    // PDF and client access
    pdfPath: String,
    clientViewedAt: Date,
    lastClientAccess: Date,

    // Permissions
    allowClientEdit: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ userId: 1, status: 1 });
invoiceSchema.index({ clientId: 1, status: 1 });
// invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });

invoiceSchema.pre("save", function (next) {

  if (this._manualStatusUpdate) return next();

  // Calculate amounts before saving
  this.items = this.items.map((item) => ({
    ...item,
    amount: item.amount || (item.quantity || 0) * (item.rate || 0), // auto-calc if missing
    taxRate: item.taxRate || 0,
  }));

  // Calculate subtotal from items
  this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);

  // Calculate tax amount
  this.taxAmount = this.items.reduce((sum, item) => {
    return sum + (item.amount * item.taxRate) / 100;
  }, 0);

  // Calculate total amount
  this.totalAmount = this.subtotal + this.taxAmount - this.discountAmount;

  // Calculate total paid amount
  const totalPaid = this.payments.reduce(
    (sum, payment) => sum + payment.amountPaid,
    0
  );
  this.totalPaid = totalPaid;

  // Calculate remaining amount
  this.remainingAmount = Math.max(0, this.totalAmount - totalPaid);
  // Auto-update status based on payment (only if not manually set to cancelled/draft)
  if (!["cancelled", "draft"].includes(this.status)) {
    const oldStatus = this.status;

    if (totalPaid === 0) {
      this.status = this.dueDate < new Date() ? "overdue" : "sent";
    } else if (totalPaid >= this.totalAmount) {
      this.status = "paid";
      this.remainingAmount = 0;
    } else {
      this.status = "partial_paid";
    }

    // Log status change if it changed automatically
    if (oldStatus !== this.status && !this.isNew) {
      this.statusLog.push({
        oldStatus,
        newStatus: this.status,
        changedBy: {
          role: "system",
        },
        reason: "Auto-updated based on payment status",
      });
    }
  }

  next();
});

// Method to add payment with user/client tracking
invoiceSchema.methods.addPayment = function (paymentData, updatedBy) {
  const payment = {
    amountPaid: paymentData.amount,
    paymentMethod: paymentData.method || "bank_transfer",
    transactionId: paymentData.transactionId,
    paidAt: paymentData.paidAt || new Date(),
    updatedBy: updatedBy,
  };

  this.payments.push(payment);
  return this.save();
};

// Method to change status manually
invoiceSchema.methods.changeStatus = function (newStatus, changedBy, reason) {
  const oldStatus = this.status;
  this.status = newStatus;

  this.statusLog.push({
    oldStatus,
    newStatus,
    changedBy,
    reason: reason || "Manual status change",
  });

  return this.save();
};

// Method to log email activity
invoiceSchema.methods.logEmail = function (emailType, sentTo, emailData = {}) {
  this.emailLog.push({
    emailType,
    sentTo,
    status: emailData.status || "sent",
    emailId: emailData.emailId,
    pdfGenerated: emailData.pdfGenerated || false,
  });
  return this.save();
};

// Method to add item
invoiceSchema.methods.addItem = function (itemData) {
  const amount = itemData.quantity * itemData.rate;
  this.items.push({
    description: itemData.description,
    quantity: itemData.quantity,
    rate: itemData.rate,
    amount: amount,
    taxRate: itemData.taxRate || 0,
  });
  return this.save();
};

// Static method to find overdue invoices
invoiceSchema.statics.findOverdue = function () {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $in: ["sent", "viewed", "partial_paid"] },
  });
};

// Static method to find invoices by status
invoiceSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

// Static method to get client's invoices
invoiceSchema.statics.findByClient = function (clientId) {
  return this.find({ clientId }).populate("userId", "name businessDetails");
};

// Static method to get user's invoices
invoiceSchema.statics.findByUser = function (userId) {
  return this.find({ userId }).populate("clientId", "name company");
};

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;
