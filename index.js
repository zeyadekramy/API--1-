const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Device = require("./models/Device");
const Plant = require("./models/Planet");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt");
const { Expo } = require("expo-server-sdk");
const expo = new Expo();
const app = express();
app.use(cors());
app.use(express.json()); 
const User = require("./models/User"); 
const jwt = require("jsonwebtoken");
require("dotenv").config();
const SECRET_KEY = process.env.SECRET_KEY;

const tokenBlacklist = new Set();
// assign push token to device route//////////////////////////
// Assign push token to device route
app.post('/devices/:uuid/push-token', async (req, res) => {
  const uuid = req.params.uuid;
  const expoPushToken = req.body.expoPushToken;

  // Validate the request
  if (!uuid || !expoPushToken) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Find the device by UUID
  const device = await device.findOne({ uuid });

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  // Update the device with the push token
  await db.collection('devices').updateOne(
    { uuid },
    { $set: { expoPushToken } }
  );

  res.json({ message: 'Push token assigned to device' });
});
// notification api //////////////////////////////////////////////////////////////

app.post("/notification", async (req, res) => {
  const { uuid, moisture, light, temperature } = req.body;

  if (!uuid || moisture == null || light == null || temperature == null) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    // Find the device and its associated plant
    const device = await Device.findOne({ uuid }).populate("assignedPlant");
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const plant = device.assignedPlant;
    if (!plant) {
      return res.status(404).json({ message: "No plant assigned to this device" });
    }

    const { defaultTemp, defaultLight, defaultSoil } = plant;
    const expoPushToken = device.expoPushToken;

    // Ensure the Expo Push Token exists
    if (!expoPushToken || !Expo.isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ message: "Invalid or missing Expo Push Token" });
    }

    // Notifications for temperature
    if (temperature < defaultTemp.min || temperature > defaultTemp.max) {
      const message = {
        to: expoPushToken,
        sound: "default",
        title: "Temperature Alert",
        body: `Temperature is out of range! Current: ${temperature}°C (Allowed: ${defaultTemp.min}°C - ${defaultTemp.max}°C)`,
        data: { uuid, temperature },
      };

      await expo.sendPushNotificationsAsync([message]);
    }

    // Notifications for moisture
    if (moisture < defaultSoil.min || moisture > defaultSoil.max) {
      const message = {
        to: expoPushToken,
        sound: "default",
        title: "Moisture Alert",
        body: `Moisture is out of range! Current: ${moisture} (Allowed: ${defaultSoil.min} - ${defaultSoil.max})`,
        data: { uuid, moisture },
      };

      await expo.sendPushNotificationsAsync([message]);
    }

    // Notifications for light
    if (light < defaultLight.min || light > defaultLight.max) {
      const message = {
        to: expoPushToken,
        sound: "default",
        title: "Light Alert",
        body: `Light level is out of range! Current: ${light} (Allowed: ${defaultLight.min} - ${defaultLight.max})`,
        data: { uuid, light },
      };

      await expo.sendPushNotificationsAsync([message]);
    }

    // Update the device's sensor data
    device.sensorData = { moisture, light, temperature, timestamp: new Date() };
    await device.save();

    res.json({ message: "Data updated and notifications sent if necessary", device });
  } catch (err) {
    res.status(500).json({ message: "Failed to update data", error: err });
  }
});
app.post("/plants", async (req, res) => {
  const { uuid } = req.body;

  if (!uuid || !expoPushToken) {
    return res.status(400).json({ message: "Missing data" });
  }


  try {
    const device = await Device.findOneAndUpdate(
      { uuid },

      { new: true }
    );

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    res.json({ message: "Expo Push Token updated successfully", device });
  } catch (err) {
    res.status(500).json({ message: "Failed to update token", error: err });
  }
});

mongoose.connect(
  process.env.mongo_uri,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// Register a new device
app.post("/register-device", async (req, res) => {
  const { name, uuid} = req.body;
  try {
    const newDevice = new Device({ name, uuid });
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
      moisture: moisture < defaultSoil.min ? "Needs Water" : moisture > defaultSoil.max ? "Too Wet" : "Moisture OK",
      light: light < defaultLight.min ? "Needs More Light" : light > defaultLight.max ? "Too Bright" : "Light OK",
      temperature:
        temperature < defaultTemp.min
          ? "Too Cold"
          : temperature > defaultTemp.max
          ? "Too Hot"
          : "Temperature OK",
    };

    // Update the status in the database
    device.status = status;
    await device.save();

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
      status, // Include the status in the response
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
    const plant = await Plant.findById(id);
    if (!plant){
      return res.status(404).json({ message: "Plant not found" });
    }
    res.json(plant);
  } catch (err) {
    res.status(500).json({ message: "Error fetching plant", error: err });
    console.log("Error fetching plant", err );
  }
});
// delete plant by id //////////////////////////////////////////////
app.delete("/plant/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const plant = await Plant.findByIdAndDelete(id);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    res.json({ message: "Plant deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting plant", error: err });
    console.log("Error deleting plant", err );
  }
})

// profile api //////////////////////////////////////
app.get("/profile", async (req, res) => {
  const { username } = req.body; // Extract username from the request body
  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }

  try {
    const user = await User.findOne({ username }).select("-password"); // Exclude password from the response
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Profile fetched successfully", user });
  } catch (err) {
    res.status(500).json({ message: "Error fetching profile", error: err });
    console.log(err);
  }
});
// register api 
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    // JWT token
    const token = jwt.sign({ id: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: "3h" });

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
    const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: "3h" });

    res.status(200).json({ message: "Login successful", username , token });
    console.log("Login successful", token);
  } catch (err) {
    res.status(500).json({ message: "Error logging in", error: err });
    console.log(err);
  }
});
// Logout API //////////////////////
app.post('/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(400).json({ message: 'Token missing' });
  }

  tokenBlacklist.add(token); // Blacklist the token
  res.status(200).json({ message: 'Logged out successfully' });
});

// Middleware to check if token is blacklisted
function isTokenBlacklisted(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ message: 'Token is blacklisted' });
  }
  
  next();
}

// Example protected route
app.get('/protected', isTokenBlacklisted, (req, res) => {
  res.json({ message: 'You accessed a protected route' });
});

app.post("/add", async (req, res) => {
  const {
    name,
    minTemp,
    maxTemp,
    minLight,
    maxLight,
    minSoil,
    maxSoil,
    description,
    photo,
  } = req.body;

  try {
    const newPlant = new Plant({
      name,
      defaultTemp: { min: minTemp, max: maxTemp },
      defaultLight: { min: minLight, max: maxLight },
      defaultSoil: { min: minSoil, max: maxSoil },
      description,
      photo,
    });

    await newPlant.save();
    res.status(201).json({ message: "Plant added successfully", plant: newPlant });
  } catch (err) {
    res.status(500).json({ message: "Error adding plant", error: err });
  }
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
  const { uuid, moisture, light, temperature, expoPushToken } = req.body;

  if (!uuid || moisture == null || light == null || temperature == null) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    const device = await Device.findOneAndUpdate(
      { uuid },
      {
        $set: {
          "sensorData.moisture": moisture,
          "sensorData.light": light,
          "sensorData.temperature": temperature,
          "sensorData.timestamp": new Date(),
          ...(expoPushToken && { expoPushToken }), // Update expoPushToken if provided
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


 //app.listen(3000, () => console.log("API running on http://localhost:3000"));
app.listen(8080,"0.0.0.0", () => console.log("API running on http://0.0.0.0:8080"));
