const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());
// Firebase Token Verification
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).send({ message: "unauthorize access" });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorize access" });
  }
};

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

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyManager = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Manager") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

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
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });
    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.status(200).send(result);
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
        if (user.role === "Manager") {
          user.roleStatus = "pending";
        }
        if (user.role === "Borrower") {
          user.roleStatus = "approved";
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
    app.patch("/users/role/:id", async (req, res) => {
      const id = req.params.id;
      const { roleStatus } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { roleStatus } }
      );

      res.send(result);
    });

    // loan application related apis
    app.get("/loan-application", async (req, res) => {
      try {
        const { email } = req.query;
        const query = {};
        if (email) {
          query.email = email;
        }
        const result = await loanApplicationsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching loan applications:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch loan applications", error });
      }
    });
    app.post("/loan-application", async (req, res) => {
      try {
        const application = req.body;
        if (application) {
          application.createdAt = new Date();
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
    app.patch("/loan-application/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const loanInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            ...loanInfo,
          },
        };
        const result = await loanApplicationsCollection.updateOne(
          query,
          updatedDoc
        );
        res.status(200).send(result);
      } catch (error) {
        console.error("Error updating loan applications:", error);
        res
          .status(500)
          .send({ message: "Failed to update loan applications", error });
      }
    });
    app.delete("/loan-application/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await loanApplicationsCollection.deleteOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.error("Error delete loan applications:", error);
        res
          .status(500)
          .send({ message: "Failed to delete loan applications", error });
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
