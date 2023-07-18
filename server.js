require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const cors = require("cors");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.plfe0ce.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  try {
    const db = client.db("book-catalog");
    const booksCollection = db.collection("books");
    const usersCollection = db.collection("users");

    // Authentication APIs Start
    app.post("/auth/signup", async (req, res) => {
      const userData = req.body;

      // find user is exist or not
      const isExistUser = await usersCollection.findOne({
        email: userData.email,
      });
      if (isExistUser) {
        return res.status(400).send({
          message: "This email already exist!",
        });
      } else {
        // hashing password
        const hashedPassword = await bcrypt.hash(userData.password, 12);

        userData.password = hashedPassword;

        const result = await usersCollection.insertOne(userData);
        if (result.acknowledged == true) {
          return res.status(200).send({
            message: "User sign up successfully!",
          });
        } else {
          return res.status(400).send({
            message: "Sign Up Failed!",
          });
        }
      }
    });

    app.post("/auth/login", async (req, res) => {
      const userData = req.body;
      const isAvailableUser = await usersCollection.findOne({
        email: userData.email,
      });
      if (!isAvailableUser) {
        return res.status(400).send({
          message: "This email does not exist!",
        });
      } else {
        const isPasswordMatched = await bcrypt.compare(
          userData.password,
          isAvailableUser.password
        );
        if (!isPasswordMatched) {
          return res.status(400).send({
            message: "Incorrect Password!",
          });
        } else {
          const accessToken = await jwt.sign(
            { email: isAvailableUser.email },
            "tokenSecret",
            { expiresIn: "30d" }
          );
          return res.status(200).send({
            message: "Login successfully!",
            token: accessToken,
          });
        }
      }
    });
    // Authentication APIs End

    // Books APIs Start
    app.get("/books/all-books", async (req, res) => {
      const { search, genre, publicationYear } = req.query;
      // Prepare the filter conditions
      const filter = {};

      if (search) {
        // Use search for title, author name, and genre
        filter.$or = [
          { title: { $regex: search, $options: "i" } },
          { author: { $regex: search, $options: "i" } },
          { genre: { $regex: search, $options: "i" } },
        ];
      }

      if (genre) {
        // Filter by genre
        filter.genre = genre;
      }

      if (publicationYear) {
        filter.publicationDate = {
          $regex: `^${publicationYear}-`,
          $options: "i",
        };
      }

      const books = await booksCollection.find(filter).toArray();
      return res.status(200).send({
        message: "Books retrieved successfully!",
        books: books,
      });
    });

    app.get("/books/recent-published", async (req, res) => {
      // const sort = { publicationDate: 1 }; 
      const result = await booksCollection
        .find({})
        .sort({ created_at: -1 }) 
        .limit(10)
        .toArray();

      return res.status(200).send({
        message: "Recent Published Books retrieved successfully!",
        books: result,
      });
    });

    app.get("/books/:id", async (req, res) => {
      const bookId = req.params.id;
      const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });

      if (book) {
        return res.status(200).send({
          message: "Book details retrieved successfully!",
          book: book,
        });
      } else {
        return res.status(404).send({
          message: "Book not found",
        });
      }
    });

    app.post("/books/add-book", async (req, res) => {
      const authorizeToken = req.headers.authorization;
      if (!authorizeToken) {
        return res.status(400).send({
          message: "Authorization not provided",
        });
      } else {
        const verifiedUser = await jwt.verify(authorizeToken, "tokenSecret");
        if (!verifiedUser) {
          return res.status(400).send({
            message: "You are not authorized",
          });
        } else {
          const bookData = req.body;
          const result = await booksCollection.insertOne(bookData);
          if (result.acknowledged == true) {
            return res.status(200).send({
              message: "Book added successfully!",
              book: bookData,
            });
          } else {
            return res.status(400).send({
              message: "Book added failed!",
            });
          }
        }
      }
    });

    app.put("/books/update-book/:id", async (req, res) => {
      const authorizeToken = req.headers.authorization;
      if (!authorizeToken) {
        return res.status(400).send({
          message: "Authorization not provided",
        });
      } else {
        const verifiedUser = await jwt.verify(authorizeToken, "tokenSecret");
        if (!verifiedUser) {
          return res.status(400).send({
            message: "You are not authorized",
          });
        } else {
          const bookId = req.params.id;
          const updatedBookData = req.body;

          // Remove the _id field from the updatedBookData object
          delete updatedBookData._id;

          const result = await booksCollection.updateOne(
            { _id: new ObjectId(bookId) },
            { $set: updatedBookData }
          );

          if (result.matchedCount > 0) {
            return res.status(200).send({
              message: "Book updated successfully!",
              book: updatedBookData,
            });
          } else {
            return res.status(404).send({
              message: "Book not found",
            });
          }
        }
      }
    });

    app.delete("/books/:id", async (req, res) => {
      const authorizeToken = req.headers.authorization;
      if (!authorizeToken) {
        return res.status(400).send({
          message: "Authorization not provided",
        });
      } else {
        const verifiedUser = await jwt.verify(authorizeToken, "tokenSecret");
        if (!verifiedUser) {
          return res.status(400).send({
            message: "You are not authorized",
          });
        } else {
          const bookId = req.params.id;

          const result = await booksCollection.deleteOne({
            _id: new ObjectId(bookId),
          });

          if (result.deletedCount > 0) {
            return res.status(200).send({
              message: "Book deleted successfully!",
            });
          } else {
            return res.status(404).send({
              message: "Book not found",
            });
          }
        }
      }
    });

    app.post("/books/:id", async (req, res) => {
      const authorizeToken = req.headers.authorization;
      if (!authorizeToken) {
        return res.status(400).send({
          message: "Authorization not provided",
        });
      } else {
        const verifiedUser = await jwt.verify(authorizeToken, "tokenSecret");
        if (!verifiedUser) {
          return res.status(400).send({
            message: "You are not authorized",
          });
        } else {
          const bookId = req.params.id;
          const bodyData = req.body;
          const filter = { _id: new ObjectId(bookId) };
          const update = {
            $push: { customerReviews: bodyData },
          };

          const result = await booksCollection.updateOne(filter, update);

          if (result.modifiedCount > 0) {
            return res.status(200).send({
              message: "Review added successfully!",
            });
          } else {
            return res.status(400).send({
              message: "Review adding failed!",
            });
          }
        }
      }
    });
    // Books APIs End
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

run().catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("Book Catalog server is running perfectly!");
});

app.listen(port, () => {
  console.log(`Book Catalog is listening on port ${port}`);
});
