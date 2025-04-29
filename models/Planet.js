const mongoose = require("mongoose");

const plantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  defaultTemp: { type: Number, required: true },
  defaultLight: { type: Number, required: true },
  defaultSoil: { type: Number, required: true },
  description: { type: String },
  photo: { type: String },
  _id : { type: String, required: true },
  id :{type :String , required: true},
});

module.exports = mongoose.model("Plant", plantSchema);
