const express = require("express");
const cors = require("cors");
const app = express();
const path = require("path");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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
    //public lesson apis related

    app.get("/public-lessons", async (req, res) => {
      const result = await lessonsCollections.find().toArray();
      res.send(result);
    });

    // ✅ GET all public lessons (including premium)
    app.get("/public-lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollections
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(lessons);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch lessons" });
      }
    });

    // GET lesson by ID
    app.get("/public-lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const lesson = await lessonsCollections.findOne({
          _id: new ObjectId(id),
        });
        if (!lesson) return res.status(404).send({ error: "Lesson not found" });

        res.send(lesson);
      } catch (error) {
        res.status(500).send({ error: "Invalid lesson ID" });
      }
    });

    // LIKE lesson
    app.post("/public-lessons/like/:id", async (req, res) => {
      try {
        const id = req.params.id;
        await lessonsCollections.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 } }
        );
        res.send({ message: "Liked" });
      } catch (error) {
        res.status(500).send({ error: "Failed to like lesson" });
      }
    });

    // FAVORITE toggle
    app.post("/public-lessons/favorite/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { email } = req.body;
        const lesson = await lessonsCollections.findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) return res.status(404).send({ error: "Lesson not found" });

        if (lesson.favorites?.includes(email)) {
          await lessonsCollections.updateOne(
            { _id: new ObjectId(id) },
            { $pull: { favorites: email } }
          );
          res.send({ message: "Removed from favorites" });
        } else {
          await lessonsCollections.updateOne(
            { _id: new ObjectId(id) },
            { $push: { favorites: email } }
          );
          res.send({ message: "Added to favorites" });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to toggle favorite" });
      }
    });

    app.post("/public-lessons/comment/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { user, text } = req.body;

        await lessonsCollections.updateOne(
          { _id: new ObjectId(id) },
          {
            $push: {
              comments: { user, text, createdAt: new Date() },
            },
          }
        );

        res.send({ message: "Comment added" });
      } catch (error) {
        res.status(500).send({ error: "Failed to add comment" });
      }
    });

    // Featured Lessons
    app.get("/featured-lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollections
          .find({ isFeatured: true })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.send(lessons);
      } catch (error) {
        res.status(500).send({ error: "Failed to load featured lessons" });
      }
    });

    // Top Contributors
    app.get("/top-contributors", async (req, res) => {
      try {
        const contributors = await lessonsCollections
          .aggregate([
            {
              $group: {
                _id: "$email", // use email field from lesson
                name: { $first: "$creator" }, // adjust to your schema
                lessonCount: { $sum: 1 },
                likes: { $sum: "$likes" },
                comments: { $sum: { $size: "$comments" } },
              },
            },
            {
              $addFields: {
                score: { $add: ["$likes", "$comments", "$lessonCount"] },
              },
            },
            { $sort: { score: -1 } },
            { $limit: 6 },
          ])
          .toArray();

        res.send(contributors);
      } catch (error) {
        res.status(500).send({ error: "Failed to load top contributors" });
      }
    });

    // Most Saved Lessons
    app.get("/most-saved-lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollections.find({}).toArray();

        const sorted = lessons
          .map((l) => ({
            ...l,
            saves: Array.isArray(l.favorites) ? l.favorites.length : 0,
          }))
          .sort((a, b) => b.saves - a.saves)
          .slice(0, 6);

        res.send(sorted);
      } catch (error) {
        console.error("Most Saved Error:", error);
        res.status(500).send({ error: "Failed to load most saved lessons" });
      }
    });

    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { email, userId } = req.body;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: email,
          success_url:
            "http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "http://localhost:5173/payment-cancel",
          metadata: { userId },
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: "Premium Plan" },
                unit_amount: 999, // $9.99
              },
              quantity: 1,
            },
          ],
        });

        res.json({ url: session.url });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const { session_id } = req.body;

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ success: false });
        }

        const email = session.customer_email;

        const result = await userCollections.updateOne(
          { email: email },
          { $set: { role: "premium" } }
        );

        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // GET user role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollections.findOne({ email });

        if (!user) return res.status(404).send({ error: "User not found" });

        res.send({ role: user.role || "user" });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
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
