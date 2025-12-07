const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d2halvx.mongodb.net/?appName=Cluster0`;

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

    const db = client.db("loanLink");
    const usersCollection = db.collection("users");
    const loansCollection = db.collection("loans");
    const loanApplicationsCollection = db.collection("loanApplications");

    // loans related apis
    app.get("/loans", async (req, res) => {
      try {
        const result = await loansCollection.find().limit(6).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching loans:", error);
        res.status(500).send({ message: "Failed to fetch loans", error });
      }
    });
    app.get("/loans/all", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;

        const loans = await loansCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await loansCollection.countDocuments();

        res.status(200).send({
          data: loans,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error) {
        console.error("Error fetching loans:", error);
        res.status(500).send({ message: "Failed to fetch loans", error });
      }
    });
    app.get("/loans/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await loansCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching loan:", error);
        res.status(500).send({ message: "Failed to fetch loan", error });
      }
    });
    app.post("/loans", async (req, res) => {
      try {
        const loan = req.body;
        if (!loan) {
          return res.status(400).send({ message: "Loan data is required" });
        }
        const result = await loansCollection.insertOne(loan);
        res.status(201).send({
          message: "Loan added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding loans:", error);
        res.status(500).send({ message: "Failed to add a loan", error });
      }
    });

    // users related apis
    app.get("/users", async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });
    app.get("/user", async (req, res) => {
      try {
        const { email } = req.query;
        const query = {};
        if (email) {
          query.email = email;
        }
        const result = await usersCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user) {
          return res.status(400).send({ message: "User data is required" });
        }
        const result = await usersCollection.insertOne(user);
        res.status(201).send({
          message: "User added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding User:", error);
        res.status(500).send({ message: "Failed to add a user", error });
      }
    });

    // loan application related apis
    app.post("/loan-application", async (req, res) => {
      try {
        const application = req.body;
        if (application) {
          application.status = "pending";
        }
        const result = await loanApplicationsCollection.insertOne(application);
        res.status(201).send({
          message: "Loan Application added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding Loan Application:", error);
        res
          .status(500)
          .send({ message: "Failed to add a loan application", error });
      }
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Loan Link server is running");
});

app.listen(port, () =>
  console.log(`Loan Link server is running on port ${port}`)
);
