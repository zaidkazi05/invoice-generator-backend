require('dotenv').config();

const cloudinary = require('cloudinary').v2;

// console.log('Cloud name:', process.env.cloudinary_cloud_name);
// console.log('API key:', process.env.cloudinary_api_key);
// console.log('API secret:', process.env.cloudinary_api_secret ? 'Present' : 'Missing');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = cloudinary;