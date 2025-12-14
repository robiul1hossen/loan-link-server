const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_GETAWAY_SECRET);

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
    return res.status(401).send({ message: "unauthorize access" });
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
    const paymentCollection = db.collection("payments");

    // loans related apis
    app.get("/loans/featured", async (req, res) => {
      try {
        const loans = await loansCollection.find().toArray();
        const featured = loans.filter((loan) => loan.isFeatured === true);
        return res.status(200).send(featured);
      } catch (error) {
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
        res.status(500).send({ message: "Failed to fetch loans", error });
      }
    });
    app.get("/loans/:email/manager", async (req, res) => {
      const { email } = req.params;
      const query = {};
      if (email) {
        query.creatorEmail = email;
      }
      const result = await loansCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/loans/filter", async (req, res) => {
      const { category, creatorEmail } = req.query;
      const query = {};
      if (category) {
        query.category = category;
        query.creatorEmail = creatorEmail;
      }
      const result = await loansCollection.find(query).toArray();

      res.send(result);
    });
    app.get("/loans/search", async (req, res) => {
      const { keyword, creatorEmail } = req.query;
      const results = await loansCollection
        .find({
          title: { $regex: keyword, $options: "i" },
        })
        .toArray();
      const myData = results.filter(
        (result) => result.creatorEmail === creatorEmail
      );

      res.send(myData);
    });
    app.get("/loans/:id", verifyFBToken, async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await loansCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch loan", error });
      }
    });
    app.post("/loans", verifyFBToken, verifyManager, async (req, res) => {
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
        res.status(500).send({ message: "Failed to add a loan", error });
      }
    });
    app.patch(
      "/loans/featured/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { isFeatured } = req.body;
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };

        if (isFeatured === true) {
          const count = await loansCollection.countDocuments({
            isFeatured: true,
          });
          if (count >= 6) {
            return res.send({ message: "cannot add more than 6 loan to home" });
          }
        }

        const loan = await loansCollection.findOne(query);

        if (loan.isFeatured === true) {
          const update = {
            $set: {
              isFeatured: (loan.isFeatured = false),
            },
          };
          const result = await loansCollection.updateOne(query, update);
          return res.send(result);
        }
        if (loan.isFeatured === false) {
          const update = {
            $set: {
              isFeatured: (loan.isFeatured = true),
            },
          };
          const result = await loansCollection.updateOne(query, update);
          return res.send(result);
        }
      }
    );
    app.patch(
      "/loans/:id/manager",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const updatedLoan = req.body;
        const updatedDoc = {
          $set: { ...updatedLoan },
        };
        const result = await loansCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.delete("/loans/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.deleteOne(query);
      res.send(result);
    });
    app.delete(
      "/loans/:id/manager",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await loansCollection.deleteOne(query);
        res.send(result);
      }
    );

    // users related apis
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });
    app.get("/users/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.status(200).send(result);
    });
    app.get("/user", verifyFBToken, async (req, res) => {
      try {
        const { email } = req.query;
        const query = {};
        if (email) {
          query.email = email;
        }
        const result = await usersCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    app.get("/users/profile/:email", async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send({ role: result?.role || "Borrower" });
    });

    app.get("/search/user", async (req, res) => {
      try {
        const keyword = req.query.keyword?.trim();
        const roles = req.query["roles[]"];

        const query = {};

        if (roles && roles.length > 0) {
          query.role = {
            $in: Array.isArray(roles) ? roles : [roles],
          };
        }

        if (keyword) {
          query.$or = [
            { displayName: { $regex: keyword, $options: "i" } },
            { email: { $regex: keyword, $options: "i" } },
          ];
        }

        const result = await usersCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        res.send({ message: "Server error" });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user) {
          return res.status(400).send({ message: "User data is required" });
        }
        const email = user.email;
        const query = { email };
        const isExist = await usersCollection.findOne(query);
        if (isExist) {
          return res.send({ message: "user already exist" });
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
        res.status(500).send({ message: "Failed to add a user", error });
      }
    });
    app.patch(
      "/users/role/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const { rejectNote } = req.body;
        const updatedDoc = {
          $set: {
            roleStatus: rejectNote.roleStatus,
            message: rejectNote.message,
          },
        };

        const result = await usersCollection.updateOne(query, updatedDoc);

        res.send(result);
      }
    );

    // loan application related apis
    app.get("/loan-application", async (req, res) => {
      try {
        const { email, applicationStatus } = req.query;
        const query = {};
        if (email) {
          query.email = email;
        }
        if (applicationStatus) {
          query.applicationStatus = applicationStatus;
        }
        const result = await loanApplicationsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch loan applications", error });
      }
    });
    app.post("/loan-application", verifyFBToken, async (req, res) => {
      try {
        const application = req.body;
        if (application) {
          application.createdAt = new Date();
          application.applicationStatus = "pending";
          application.paymentStatus = "unpaid";
          application.applicationFee = 10;
        }
        const result = await loanApplicationsCollection.insertOne(application);
        res.status(201).send({
          message: "Loan Application added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to add a loan application", error });
      }
    });
    app.patch("/loan-application/:id", verifyFBToken, async (req, res) => {
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
        res
          .status(500)
          .send({ message: "Failed to update loan applications", error });
      }
    });
    app.patch(
      "/loan-application/:id/approve",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            applicationStatus: "approved",
            approvedAt: new Date(),
          },
        };
        const result = await loanApplicationsCollection.updateOne(
          query,
          updatedDoc
        );
        res.send(result);
      }
    );
    app.patch(
      "/loan-application/:id/reject",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            applicationStatus: "rejected",
            approvedAt: new Date(),
          },
        };
        const result = await loanApplicationsCollection.updateOne(
          query,
          updatedDoc
        );
        res.send(result);
      }
    );
    app.delete("/loan-application/:id", verifyFBToken, async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await loanApplicationsCollection.deleteOne(query);
        res.status(200).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to delete loan applications", error });
      }
    });

    // payment related apis
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price: "price_1ScWxQ2a4KlqyhEpIlSPnr4N",
            // price_data: {
            //   currency: "USD",
            //   unit_amount: 10000,
            //   product_data: {
            //     name: paymentInfo.title,
            //   },
            // },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          applicationId: paymentInfo.applicationId,
          loanTitle: paymentInfo.title,
          applicantEmail: paymentInfo.email,
          category: paymentInfo.category,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/cancelled`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          const applicationId = session.metadata.applicationId;
          const query = { _id: new ObjectId(applicationId) };
          const loanApplication = await loanApplicationsCollection.findOne(
            query
          );
          if (loanApplication) {
            const updatedDoc = {
              $set: {
                paymentStatus: "paid",
                paidAt: new Date(),
              },
            };
            const result = await loanApplicationsCollection.updateOne(
              query,
              updatedDoc
            );
            const paymentInfo = {
              amount: session.amount_total / 100,
              transactionId: session.payment_intent,
              email: session.metadata.applicantEmail,
              applicationId,
              title: session.metadata.loanTitle,
              ApplicationStatus: session.payment_status,
              paidAt: new Date(),
            };
            if (paymentInfo) {
              const queryId = { applicationId: paymentInfo.applicationId };
              const exist = await paymentCollection.findOne(queryId);
              if (exist) {
                return res.send({ message: "payment already exist" });
              }
              const pay = await paymentCollection.insertOne(paymentInfo);
              return res.send(pay);
            }
            return res.send(result, paymentInfo);
          }
        }
      }
      res.send({ success: true });
    });
    app.get("/payment/details/:id", async (req, res) => {
      const { id } = req.params;
      const query = { applicationId: id };
      const result = await paymentCollection.findOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Loan Link server is running");
});

app.listen(port, () =>
  console.log(`Loan Link server is running on port ${port}`)
);
