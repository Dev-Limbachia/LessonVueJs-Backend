const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const { ObjectId } = require("mongodb");

// connection to mongodb
let propertiesReader = require("properties-reader");
let propertiesPath = path.resolve(__dirname, "config/db.properties");
let properties = propertiesReader(propertiesPath);
let dbPprefix = properties.get("db.prefix");

//URL-Encoding of User and PWD
//for potential special characters
let dbUsername = encodeURIComponent(properties.get("db.user"));
let dbPwd = encodeURIComponent(properties.get("db.pwd"));
let dbName = properties.get("db.dbName");
let dbUrl = properties.get("db.dbUrl");
let dbParams = properties.get("db.params");
const uri = dbPprefix + dbUsername + ":" + dbPwd + dbUrl + dbParams;

const { MongoClient, ServerApiVersion } = require("mongodb");
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
let db;

async function connectToDatabase() {
  try {
    // Connect to the MongoDB server
    await client.connect();
    db = client.db(dbName);
    console.log("Connected to the database");
  } catch (error) {
    console.error("Error connecting to the database:", error);
    process.exit(1); // Exit the application on connection error
  }
}

// Define middleware
app.use(express.json());
app.use(cors());

// Logger Middleware
app.use((req, _res, next) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  next(); // Continue to the next middleware or route handler
});

// Serve static files from the 'static' directory
app.use('/image', express.static(path.join(__dirname, 'image')));

// Custom 404 handler for static files
app.use('/image', (_req, res) => {
  res.status(404).send('404: File Not Found');
});


// GET REQUEST - LESSONS
app.get("/lessons", async (_req, res) => {
  try {
    // Ensure the database connection is established
    if (!db) {
      await connectToDatabase();
    }

    // Access the lessons collection in your MongoDB
    const lessonsCollection = db.collection("lessons");

    // Fetch all lessons
    const lessons = await lessonsCollection.find({}).toArray();

    if (lessons.length === 0) {
      res.status(404).json({ message: "No lessons found." });
    } else {
      res.json(lessons);
    }
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching lessons" });
  }
});

// POST REQUEST - SUBMIT ORDER
app.post("/orders", async (req, res) => {
  try {
    // Ensure the database connection is established
    if (!db) {
      await connectToDatabase();
    }

    // Access the "orders" collection in your MongoDB
    const ordersCollection = db.collection("orders");

    // Extract order data from the request body
    const { name, phoneNumber, lessons } = req.body;

    // Calculate numberOfSpaces by summing up the numberOfLessons for all lessons
    const numberOfSpaces = lessons.reduce((total, lesson) => total + lesson.numberOfLessons, 0);

    // Create a new order document
    const newOrder = {
      name,
      phoneNumber,
      lessons, // Store lessons array directly
      numberOfSpaces, // Store the total number of spaces
    };

    // Insert the new order into the "orders" collection
    const result = await ordersCollection.insertOne(newOrder);

    if (result && result.ops && result.ops.length > 0) {
      const savedOrder = result.ops[0];

      // Iterate through lessons in the order and update availableInventory
      for (const lesson of lessons) {
        await updateLessonInventory(lesson.lessonID, lesson.numberOfLessons);
      }

      res.status(201).json(savedOrder);
    } else {
      res.status(500).json({ error: "Failed to save the order" });
    }
  } catch (error) {
    console.error("Error saving order:", error);
    res.status(500).json({ error: "An error occurred while saving the order" });
  }
});

// PUT REQUEST - UPDATE INVENTORY
app.put("/updateInventory/:lessonId", async (req, res) => {
  try {
    // Ensure the database connection is established
    if (!db) {
      await connectToDatabase();
    }

    // Access the "lessons" collection in your MongoDB
    const lessonsCollection = db.collection("lessons");

    // Extract lesson ID from the request parameters
    const lessonId = req.params.lessonId;

    // Find the lesson by its id
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(lessonId) });

    if (!lesson) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }

    // Extract the number of lessons to update from the request body
    const { numberOfLessonsToUpdate } = req.body;

    // Update the available spaces for the lesson
    const updatedInventory = lesson.availableInventory - numberOfLessonsToUpdate;

    // Update the lesson document with the new availableInventory value
    const updateResult = await lessonsCollection.updateOne(
      { _id: new ObjectId(lessonId) }, // Use "ObjectId" to match the lesson
      { $set: { availableInventory: updatedInventory } } // Update the availableInventory field
    );

    if (updateResult.modifiedCount === 0) {
      res.status(400).json({ message: "No changes made to available spaces" });
    } else {
      // Log the success message to the console
      console.log(`Spaces updated successfully for lesson with ID ${lessonId}`);
      res.status(200).json({ message: "Spaces updated successfully" });
    }
  } catch (error) {
    console.error(`Error updating spaces for lesson with ID ${lessonId}:`, error);
    res.status(500).json({ error: "An error occurred while updating spaces" });
  }
});


// SEARCH 
app.get('/search', async (req, res, next) => {
  const keyword = req.query.q;

  try {
    // Perform a MongoDB query to search for activities by keyword in title or location
    const lessons = await db.collection('lessons').find({
      $or: [
        { location: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
      ],
    }).toArray();

    res.json(lessons);
  } catch (error) {
    next(error);
  }
});


// Start the Express server
const port = process.env.PORT || 3000;

// Ensure the database connection is established before starting the server
connectToDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Error starting the server:", error);
  });
