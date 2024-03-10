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

// POST
app.post('/orders', async (req, res, next) => {
  const body = req.body;
  try {
      await db.collection("orders").insertOne(body);
      res.send({message: "Order successful"})
  } catch (error) {
      next(error)
  }
})

// UPDATE ACTIVITIES SPACES
app.put('/updateLessons', async (req, res, next) => {
  const lessons = req.body;

  try {
    for (const lesson of lessons) {
      const filter = { _id: new ObjectId(lesson._id) };
      const update = { $inc: { availableInventory: -lesson.quantity } };

      await db.collection('lessons').updateOne(filter, update);
    }

    res.send({ message: "Spaces updated" });
  } catch (error) {
    next(error);
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
