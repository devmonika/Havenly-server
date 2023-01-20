const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const jwt = require('jsonwebtoken')
require('dotenv').config();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());


// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gympzpz.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
console.log('database connected')



async function run() {
    try {
        // Database Collections
        const usersCollection = client.db('havenlyDB').collection('users');
        const reviewsCollection = client.db('havenlyDB').collection('reviews');

        // users collection
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        //get users
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        //get jwt
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                console.log(token)
                console.log(user)
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: '' })
        })

        // Reviews Collection

        // get all the reviews
        app.get('/reviews', async(req, res) => {
            const query = {};
            const reviews = await reviewsCollection.find(query).toArray();
            res.send(reviews);
        }); 

        // post a review
        app.post('/reviews', async(req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

    }
    finally {

    }
}
run().catch(console.log);


app.get('/', async (req, res) => {
    res.send('server running');
})

app.listen(port, () => {
    console.log(`server running on port ${port}`);
})