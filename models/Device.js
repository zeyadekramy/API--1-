// models/Plant.js
const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  uuid: { type: String, unique: true, required: true },
  wifiSSID: { type: String, required: true },
  wifiPassword: { type: String, required: true },
  sensorData: {
    moisture: { type: Number, default: 0 },
    light: { type: Number, default: 0 },
    temperature: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
  },
  assignedPlant: { type: mongoose.Schema.Types.ObjectId, ref: "Plant" }, // 👈 MUST EXIST
});

module.exports = mongoose.model("Device", deviceSchema);
