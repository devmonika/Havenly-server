const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gympzpz.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
console.log('database connected');



// function generatePDF(data) {
//     const doc = new PDFDocument();
//     const chunks = [];

//     // pipe the PDFDocument to an array of chunks
//     doc.pipe(
//         (function () {
//             let chunks = [];
//             return {
//                 write: function (chunk) {
//                     chunks.push(chunk);
//                 },
//                 end: function () { },
//                 getBuffer: function () {
//                     return Buffer.concat(chunks);
//                 },
//             };
//         })()
//     );

//     // Add content to the PDF
//     doc.text(`Name: ${data.name}`);
//     doc.text(`Email: ${data.email}`);
//     doc.text(`Message: ${data.message}`);

//     // End the PDF
//     doc.end();

//     // return the PDF buffer
//     return doc;
// } //end here

async function sendBookingEmail(payment){

    const { buyer_email, category, city, date, price, name } = payment;
    const auth = {
        auth: {
            api_key: process.env.EMAIL_SEND_KEY,
            domain: process.env.EMAIL_SEND_DOMAIN
        }
    }

    let transporter = nodemailer.createTransport(mg(auth));


   await transporter.sendMail({
        from: "webtitans59@gmail.com", // verified sender email
        to: "webtitans59@gmail.com", // recipient email
        subject: `Your booking ${category} apartment is confirmed`, // Subject line
        text: "Hello Mr!", // plain text body
        html: `<h3>Your booking is confirmed</h3>
        <div>
        <p>Booking Date ${date}</p>
        <p>Total Price $${price} paid.</p>
        <p>Apartment place ${city} </p>
        <p>Thanks form Havenly.</p>
        </div>`,
        // attachments: [
        //     {
        //         filename: 'test.pdf',
        //         content: pdf.getBuffer(),
        //     }
        // ] // html body
    }, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });


}


function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
    try {
        // Database Collections
        const usersCollection = client.db('havenlyDB').collection('users');
        const GoogleusersCollection = client.db('havenlyDB').collection('GoogleSignUp');
        const categoriesCollection = client.db('havenlyDB').collection('categories');
        const reviewsCollection = client.db('havenlyDB').collection('reviews');
        const propertiesCollection = client.db('havenlyDB').collection('properties');
        const wishListsCollection = client.db('havenlyDB').collection('wishlist');
        const paymentsCollection = client.db('havenlyDB').collection('payments');
        const addPromotePaymentsCollection = client.db('havenlyDB').collection('promotePayments');
        const reportCollection = client.db('havenlyDB').collection('report');

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyBuyer = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "buyer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "seller") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

        //get jwt
    app.get("/jwt", async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);

        if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
            expiresIn: "7d",
        });
        // console.log(token)
        // console.log(user)
        return res.send({ accessToken: token });
        }
        res.status(403).send({ accessToken: "" });
    });

        // FOR PAYMENT 
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        });

        // store bookings payments info 
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.booking_id;
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updateResult = await propertiesCollection.updateOne(filter, updatedDoc)
            sendBookingEmail(payment);
            res.send(result);
        });

        // store premium service payments info 
        app.post('/promote/payments', async (req, res) => {
            const payment = req.body;
            const result = await addPromotePaymentsCollection.insertOne(payment);
            const id = payment.booking_id;
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    isPremium: "premium",
                    // transactionId: payment.transactionId
                }
            }
            const updateResult = await propertiesCollection.updateOne(filter, updatedDoc)
            // sendBookingEmail(payment);
            res.send(result);
        });


        //  All Users Collections

        //create users 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        //get users
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        //create Googlesignup users
        app.post('/signup', async (req, res) => {
            const googleSignUpUser = req.body;
            // console.log(googleSignUpUser)
            const result = await GoogleusersCollection.insertOne(googleSignUpUser);
            res.send(result);

        });
        //get Googlesignup users
        app.get('/signup', async (req, res) => {
            const query = {};
            const users = await GoogleusersCollection.find(query).toArray();
            res.send(users);
        });





        // get all seller 
        app.get('/users/sellers', async (req, res) => {
            const query = { role: "seller" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });


        //update a user
        // app.patch('users/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const user = req.body;
        //     const filter = { _id: ObjectId(id) };
        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: user
        //     };
        //     const result = await usersCollection.updateOne(filter, updatedDoc, options);
        //     res.send(result);
        // });

        //update user with email
        // app.get('/users', async (req, res) => {
        //     const email = req.query.email;
        //     console.log(email);
        //     const query = { email: email };
        //     const result = await usersCollection.find(query).toArray();
        //     res.send(result);
        // });




        // verify seller
        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            // console.log(decodedEmail)
            const query = { email: decodedEmail };
            const users = await usersCollection.findOne(query)

            if (users?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            // else if(users?.isVerified =='verified'){
            //     return res.status(403).send({message: 'user already verified'});
            // }

            const email = req.params.email;
            // console.log(email)
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    isVerified: 'verified'
                }
            }
            // const result2 = await productsCollection.updateMany(filter, updatedDoc,options);
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send({ result });
        });

        // get all buyers
        app.get('/users/buyers', async (req, res) => {
            const query = { role: "buyer" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });
        // delete a user with id
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })


        // Categories Collection
        // get all the categories
        app.get('/categories', async (req, res) => {
            const query = {};
            const categories = await categoriesCollection.find(query).toArray();
            res.send(categories);
        });



        //load categories by id
        app.get('/categories/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await categoriesCollection.findOne(query);
            res.send(result);
        });




        // Properties Collection

        // get seller properties for the route my properties

        app.get('/properties/myproperty', async (req, res) => {
            const seller_email = req.query.email;
            const query = { seller_email };
            const property = await propertiesCollection.find(query).toArray();
            res.send(property);
        });

        // * delete seller property

        app.delete('/property/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await propertiesCollection.deleteOne(filter);
            res.send(result);
        });

        //* add property
        app.post('/properties', async (req, res) => {
            const property = req.body;
            const result = await propertiesCollection.insertOne(property);
            res.send(result);
        });
        // Get all properties
        app.get('/properties', async (req, res) => {
            const query = {};
            const result = await propertiesCollection.find(query).toArray();
            res.send(result);         
        });
        
        // get all advertise properties morsalin
        app.get('/premium/properties', async (req, res)=>{
            const query = { isPremium: "premium"};
            const result = await propertiesCollection.find(query).sort({_id: -1}).limit(4).toArray();
            res.send(result);
        })

        // get single property 
        app.get('/properties/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await propertiesCollection.findOne(query);
            res.send(result);
        });

        // app.get('/categories/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: ObjectId(id) }
        //     const category = await propertiesCollection.filter(c => c._id === query);
        //     res.send(category);
        // });




        //individual categorywise data load
        app.get('/properties/property/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: category };
            if (category === "Residential") {
                const cate = await propertiesCollection.find(query).toArray();
                res.send(cate);
            }
            else if (category === "Luxury") {
                const cate = await propertiesCollection.find(query).toArray();
                res.send(cate);
            }
            else if (category === "Commercial") {
                const cate = await propertiesCollection.find(query).toArray();
                res.send(cate);
            }
            else if (category === "Affordable Housing") {
                const cate = await propertiesCollection.find(query).toArray();
                res.send(cate);
            }
            else {
                const cate = await propertiesCollection.find({}).toArray();
                res.send(cate);
            }
        });





        app.get('/properties/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: category };
            const result = await propertiesCollection.find(query).toArray();
            res.send(result);
        })


        //* category wise product load

        // app.get('/properties/property/:category', async (req, res) => {
        //     const category = req.params.category;
        //     const query = { category: category };
        //     if (category === "Residential") {
        //         const cate = await propertiesCollection.find(query).toArray();
        //         res.send(cate);
        //     }
        //     else if (category === "Luxury") {
        //         const cate = await propertiesCollection.find(query).toArray();
        //         res.send(cate);
        //     }
        //     else if (category === "Commercial") {
        //         const cate = await propertiesCollection.find(query).toArray();
        //         res.send(cate);
        //     }
        //     else if (category === "Affordable Housing") {
        //         const cate = await propertiesCollection.find(query).toArray();
        //         res.send(cate);
        //     }
        //     else {
        //         const cate = await propertiesCollection.find({}).toArray();
        //         res.send(cate);
        //     }
        // });

        // app.get('/properties/property/:category', async (req, res) => {
        //     const category = req.params.category;
        //     const query = { category: category };

        //     const validCategories = ["Residential", "Luxury", "Commercial", "Affordable Housing"];

        //     if (!validCategories.includes(category)) {
        //         return res.status(400).send({
        //             error: 'Invalid category name'
        //         });
        //     }

        //     const cate = await propertiesCollection.find(query).toArray();
        //     res.send(cate);
        // });

        app.get('/properties/property/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: category };
            let cate = [];

            if (category !== "All") {
                cate = await propertiesCollection.find(query).toArray();
            } else {
                cate = await propertiesCollection.find({}).toArray();
            }

            res.send(cate);
        });


        // wishList collection 

        // *get wishlist for a specific user
        app.get('/wishlist', async (req, res) => {
            const email = req.query.email;
            // const decodedEmail = req.decoded.email;

            // if (email !== decodedEmail) {
            //     res.status(403).send({ message: 'Forbidden Access' });
            // }

            const query = { email: email };
            const wishlist = await wishListsCollection.find(query).toArray();
            res.send(wishlist);
        });

        // * add property to wishlist
        app.post('/wishlist', verifyJWT, async (req, res) => {
            const wishlist = req.body;
            const query = {
                address: wishlist.address,
                email: wishlist.email,
                userName: wishlist.userName
            }

            const wishlisted = await wishListsCollection.find(query).toArray();

            if (wishlisted.length) {
                const message = `${wishlist.address} is already added to wishlist`;
                return res.send({ acknowledged: false, message });
            }

            const result = await wishListsCollection.insertOne(wishlist);
            res.send(result);
        });

        // // * updated added button

        // app.patch('/wishlist', verifyJWT, async (req, res) => {
        //     const wishlist = req.body;
        //     const query = {
        //         address: wishlist.address,
        //         email: wishlist.email,
        //         userName: wishlist.userName,
        //     };

        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: { added: wishlist.added }
        //     }

        //     const result = await wishListsCollection.updateOne(
        //         query,
        //         options,
        //         updatedDoc
        //     );

        //     res.send(result);
        // });

        // * delete an item from wishlist

        app.delete('/wishlist/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await wishListsCollection.deleteOne(filter);
            res.send(result);
        })

        // Reviews Collection
        // get all the reviews
        app.get('/reviews', async (req, res) => {
            const query = {};
            const reviews = await reviewsCollection.find(query).toArray();
            res.send(reviews);
        });

        // post a review
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });


        //post report
        app.post('/report', async (req, res) => {
            const reportData = req.body;
            const result = await reportCollection.insertOne(reportData);
            res.send(result);
        });

        // get all the report
        app.get('/report', async (req, res) => {
            const query = {};
            const report = await reportCollection.find(query).toArray();
            res.send(report);
        });

        // get single report 
        app.get('/report/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await reportCollection.findOne(query);
            res.send(result);
        });
        app.get('/', async (req, res) => {

        })


        // app.get('/reviews', async(req, res) =>{
        //     // console.log(req.query.email);
        //     let query = {};
        //     if(req.query.email){
        //       query = {
        //         reviewerEmail:req.query.email
        //       }
        //     }
        //     const cursor = reviewsCollection.find(query);
        //     const review = await cursor.toArray();
        //     console.log(review);
        //     res.send(review);
        //   });

        //get review by email for specific user
        app.get('/review', async (req, res) => {
            const email = req.query.email;
            console.log(email)
            const query = { reviewerEmail: email };
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        });

        //edit and update user review
        app.patch('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const reviews = req.body;
            const ratings = req.body;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    reviews: reviews.reviews,
                    ratings: ratings.ratings

                }

            }
            console.log(reviews.reviews)
            const result = await reviewsCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        });

        //delete review
        app.delete('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await reviewsCollection.deleteOne(query);
            res.send(result);
        });

        //get user info for profile page
        app.get('/user', async (req, res) => {
            const email = req.query.email;
            console.log(email)
            const query = { email: email };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });
    }
    finally {

    }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("server running");
});

app.listen(port, () => {
  console.log(`server running on port: ${port}`);
});
