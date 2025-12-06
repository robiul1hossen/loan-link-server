const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

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
    const loansCollection = db.collection("loans");

    app.get("/loans", async (req, res) => {
      try {
        const result = await loansCollection.find().limit(6).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching loans:", error);
        res.status(500).send({ message: "Failed to fetch loans", error });
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
