const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

//middle ware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DIGITAL_LIFE_USER}:${process.env.DIGITAL_LIFE_PASS}@cluster0.k6koi0k.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    //database
    const db = client.db("digital-life-session");
    const userCollections = db.collection("users");
    const lessonsCollections = db.collection("lesson");

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    //All apis started from here===============
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;

      const userExist = await userCollections.findOne({ email });

      if (userExist) {
        return res.send({ message: "user already exist" });
      }

      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    app.post("/add-lesson", async (req, res) => {
      try {
        const lesson = req.body;

        if (!lesson.email) {
          return res.status(400).send({ message: "email missing!" });
        }

        // Validation
        if (
          !lesson.title ||
          !lesson.description ||
          !lesson.category ||
          !lesson.emotional
        ) {
          return res.status(400).send({ message: "All fields are required" });
        }

        // Add createdAt
        lesson.createdAt = new Date();

        // Insert into DB
        const result = await lessonsCollections.insertOne(lesson);

        res.status(201).send({ _id: result.insertedId, ...lesson });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });
    app.get("/my-lessons/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await lessonsCollections.find(query).toArray();
      res.send(result);
    });
    //public less apis related
  } finally {
    // ❌ DON'T CLOSE THE CLIENT HERE
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("digital life complete");
});
app.listen(port, () => {
  console.log("app is connection port is :", port);
});
