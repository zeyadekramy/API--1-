const mongoose = require("mongoose");

const plantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  defaultTemp: { type: Number, required: true },
  defaultLight: { type: Number, required: true },
  defaultSoil: { type: Number, required: true },
  description: { type: String },
  photo: { type: String }, // you can store an image URL here
});

module.exports = mongoose.model("Plant", plantSchema);
