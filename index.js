require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./utils/swagger");
const cors = require("cors");

const authRoutes = require('./routes/auth-routes');
const userRoutes = require('./routes/user-routes');
const clientRoutes = require('./routes/client-routes');
const invoiceRoutes = require('./routes/invoice-routes');
const pdfRoutes = require('./routes/pdf-routes');
const emailRoutes = require('./routes/email-routes');

app.use(express.json());

app.use(
    cors({
        credentials: true,
        origin: ['https://invoice-generator-backend-nx8n.onrender.com/'],
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    })
);

app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/client', clientRoutes);
app.use('/invoice', invoiceRoutes);
app.use('/pdf', pdfRoutes);
app.use('/email', emailRoutes);

// Swagger docs route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "OK",
    });
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("DB connected")
        app.listen(process.env.PORT || 5000, "0.0.0.0", () => {
            console.log(`Server running on PORT ${process.env.PORT}`);
        })
    })
    .catch((err) => console.log(`DB Connection error: ${err}`));