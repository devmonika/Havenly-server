const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());


// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gympzpz.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
console.log('database connected')

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}


async function run() {
    try {
        // Database Collections
        const usersCollection = client.db('havenlyDB').collection('users');
        const categoriesCollection = client.db('havenlyDB').collection('categories');
        const reviewsCollection = client.db('havenlyDB').collection('reviews');
        const propertiesCollection = client.db('havenlyDB').collection('properties');
        const wishListsCollection = client.db('havenlyDB').collection('wishlist');
        const paymentsCollection = client.db('havenlyDB').collection('payments');



        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        };
        const verifyBuyer = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'buyer') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        };
        const verifySeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'seller') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        };


        //get jwt
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                // console.log(token)
                // console.log(user)
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: '' })
        });

        // FOR PAYMENT 
        app.post('/create-payment-intent', async(req, res) =>{
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types":[
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        });

        // store payments info 
        app.post('/payments', async(req, res)=>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.booking_id;
            const filter = {_id: ObjectId(id)}
            const updatedDoc ={
                $set:{
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updateResult = await propertiesCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })


        //  All Users Collections

        //create users 
        app.post('/users', async (req, res) => {
            const user = req.body;
            // console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        //get users
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });


        // get all seller 
        app.get('/users/sellers', async (req, res) => {
            const query = { role: "seller" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

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


        // all Properties Collection
        //  app.post('/properties', async (req, res) => {
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
        })

        // get single property 
        app.get('/properties/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await propertiesCollection.findOne(query);
            res.send(result);
        });


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
                const message = `${wishlist.productName} is already added to wishlist`;
                return res.send({ acknowledged: false, message });
            }

            const result = await wishListsCollection.insertOne(wishlist);
            res.send(result);
        });

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

        //edit and update user
        app.patch('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const reviews = req.body;
            const query = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    reviews: reviews.reviews

                }

            }
            console.log(reviews.reviews)
            const result = await reviewsCollection.updateOne(query, updatedDoc);
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


app.get('/', async (req, res) => {
    res.send('server running');
});

app.listen(port, () => {
    console.log(`server running on port: ${port}`);
});