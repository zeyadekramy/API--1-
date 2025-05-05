const mongoose = require("mongoose");

const plantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  defaultTemp: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  defaultLight: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  defaultSoil: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  description: { type: String },
  photo: { type: String },
});

module.exports = mongoose.model("Plant", plantSchema);
