const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Device = require("./models/Device");
const Plant = require("./models/Planet");
const verifyToken = require("./middleware/auth");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt");
const app = express();
app.use(cors());
app.use(express.json()); 
const User = require("./models/User"); 
const jwt = require("jsonwebtoken");
require("dotenv").config();
const SECRET_KEY = process.env.SECRET_KEY;

mongoose.connect(
  process.env.mongo_uri,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// Register a new device
app.post("/register-device", async (req, res) => {
  const { name, uuid, wifiSSID, wifiPassword } = req.body;
  try {
    const newDevice = new Device({ name, uuid, wifiSSID, wifiPassword });
    await newDevice.save();
    res.status(201).json({ message: "Device registered" });
  } catch (err) {
    res.status(500).json({ message: "Error registering device", error: err });
  }
});

// Get all plants
app.get("/plants", async (req, res) => {
  try {
    const plants = await Plant.find(); // Fetch all plants from the database
    res.json(plants); // Send the list of plants as the response
  } catch (err) {
    res.status(500).json({ message: "Error fetching plants", error: err });
  }
});


// Get device by UUID
// Get device by UUID with associated plant data
app.get("/device/:uuid", async (req, res) => {
  const { uuid } = req.params;
  try {
    const device = await Device.findOne({ uuid }).populate("assignedPlant");

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const plant = device.assignedPlant;

    if (!plant) {
      return res.json({ uuid: device.uuid, name: device.name, assignedPlant: null });
    }

    const { moisture, light, temperature } = device.sensorData || {};
    const { defaultSoil, defaultLight, defaultTemp } = plant;

    // Status Logic
    const status = {
      moisture: moisture < defaultSoil ? "Needs Water" : moisture > defaultSoil + 20 ? "Too Wet" : "Moisture OK",
      light: light < defaultLight ? "Needs More Light" : light > defaultLight + 200 ? "Too Bright" : "Light OK",
      temperature:
        temperature < defaultTemp ? "Too Cold" : temperature > defaultTemp + 5 ? "Too Hot" : "Temperature OK",
    };

    const deviceData = {
      uuid: device.uuid,
      name: device.name,
      sensorData: {
        moisture,
        light,
        temperature,
      },
      assignedPlant: {
        name: plant.name,
        photo: plant.photo,
        description: plant.description,
        defaultTemp,
        defaultLight,
        defaultSoil,
      },
      status, // <- include this new field
    };

    res.json(deviceData);
  } catch (err) {
    res.status(500).json({ message: "Error fetching device", error: err });
  }
});


// Generate QR code for pot ID
app.get("/generate-qr/:potId", (req, res) => {
  const potId = req.params.potId;

  QRCode.toDataURL(potId, (err, url) => {
    if (err) {
      return res.status(500).send("Error generating QR code");
    }
    res.send(`<img src="${url}" />`);
  });
});
// get plant by id 
app.get("/plant/:id", async (req, res) => {
  const {id} = req.params;
  try {
    const plant = await plant.findById(id);
    if (!plant){
      return res.status(404).json({ message: "Plant not found" });
    }
    res.json(plant);
  } catch (err) {
    res.status(500).json({ message: "Error fetching plant", error: err });
    console.log("Error fetching plant", err );
  }
});
// profile api
app.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password"); // for not showing the password of the user
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({message: "User profile", user });
  } catch (err) {
    res.status(500).json({ message: "Error fetching user profile", error: err });
    console.log("Error fetching user profile", err );
  }
}
);
// register api 
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    // JWT token
    const token = jwt.sign({ id: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: "1h" });

    res.status(201).json({ message: "User registered", token });
  } catch (err) {
    res.status(500).json({ message: "Error registering user", error: err });
  }
});
// login api
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password, try again" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: "1h" });

    res.status(200).json({ message: "Login successful", token });
    console.log("Login successful", token);
  } catch (err) {
    res.status(500).json({ message: "Error logging in", error: err });
    console.log(err);
  }
});


app.post('/add', async (req, res) => {
  const { name, defaultTemp, defaultLight, defaultSoil, description, photo } = req.body;
  const plant = new Plant({ name, defaultTemp, defaultLight, defaultSoil, description, photo });
  await plant.save();
  res.json({ success: true, plant });
});


// Assign a plant to a device
app.post("/assign-plant", async (req, res) => {
  const { uuid, plantId } = req.body;

  try {
    const plant = await Plant.findById(plantId);
    if (!plant) return res.status(404).json({ message: "Plant not found" });

    const device = await Device.findOneAndUpdate({ uuid }, { $set: { assignedPlant: plantId } }, { new: true });

    if (!device) return res.status(404).json({ message: "Device not found" });

    res.json({ message: "Plant assigned", device });
  } catch (err) {
    res.status(500).json({ message: "Error assigning plant", error: err });
  }
});
// Update sensor data from ESP32
app.post("/update-data", async (req, res) => {
  const { uuid, moisture, light } = req.body;

  if (!uuid || moisture == null || light == null) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    const device = await Device.findOneAndUpdate(
      { uuid },
      {
        $set: {
          "sensorData.moisture": moisture,
          "sensorData.light": light,
          "sensorData.timestamp": new Date(),
        },
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    res.json({ message: "Data updated", device });
  } catch (err) {
    res.status(500).json({ message: "Failed to update data", error: err });
  }
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));
