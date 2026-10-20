const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

mongoose.set('strictQuery', false);

const uri =  process.env.MONGODB_URI_HOME;
mongoose.connect(uri,{'dbName':'SocialDB'});

const User = mongoose.model('User', { username: String, email: String, password: String });
const Post = mongoose.model('Post', { userId: mongoose.Schema.Types.ObjectId, text: String });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: SECRET_KEY, resave: false, saveUninitialized: true, cookie: { secure: false } }));


// Insert your authenticateJWT Function code here.
function authenticateJWT(req, res, next) {
    // Get token from session
    const token = req.session.token;

    // If no token, return 401 Unauthorized
    if(!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        // Verify token
        const decoded = jwt.verify(token, SECRET_KEY);

        // Attach user data to request object
        req.user = decoded;

        // Continue to the next middleware
        next();
    } catch (error) {
        // If invalid token, return 401
        return res.status(401).json({ message: 'Invalid token' });
    }
}
// Insert your requireAuth Function code here.
function requireAuth(req, res, next) {
    const token = req.session.token; // Get token from session

    if (!token) return res.redirect('/login'); // If no token, redirect to login page

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // Verify token
        req.user = decoded; // Attach user data to request object. This carries the userId and username from the token payload.
        next(); // Pass control to the next middleware or route handler
    }
    catch (error) {
        return res.redirect('/login'); // If token is invalid, redirect to login page
    }
}

// Insert your routing HTML code here.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'))); // Home page route
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html'))); // Registration page route
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html'))); // Login page route
app.get('/post', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html'))); // Post creation page route (protected)
app.get('/index', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'), { username: req.user.username })); // Main page route (protected) and passing username to the template

// Insert your user registration code here.
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body; // Get user data from request body

    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] }); // Check for existing username or email
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' }); // Return error if user exists
        };

        // Create and save the new user
        const newUser = User({ username, email, password }); // Create new user instance
        await newUser.save(); // Save user to database

        // Generate JWT token and store in session
        const token = jwt.sign({ userId: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: '1h' }); // Generate token
        req.session.token = token; // Store token in session

        // Respond with success message
        // res.send({"message": `The user ${username} has been added successfully!`}); // Send success response
        res.redirect(`/index?username=${newUser.username}`); // Redirect to main page with username as query parameter
    }
    catch (error) {
        console.error(error); // Log error to console
        res.status(500).json({ message: 'Internal server error' }); // Return 500 Internal Server Error
    }
});

// Insert your user login code here.
app.post('/login', async (req, res) => {
    const { username, password } = req.body; // Get user data from request body

    try {
        // Check if the user already exists with the provided credentials
        const user = await User.findOne({ username, password }); // Find user by username and password

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        } else {
            // If user exists, generate JWT token and store in session
            const token = jwt.sign({ userId: user._id, username: user.username }, SECRET_KEY, { expiresIn: '1h' }); // Generate token
            req.session.token = token; // Store token in session

            // Respond with success message
            res.redirect(`/index?username=${user.username}`); // Redirect to main page with username as query parameter
        }
    }
    catch (error) {
        console.error(error);
        // Handle server errors
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Insert your post creation code here.
app.post('/post', authenticateJWT, async (req, res) => {
    const { text } = req.body; // Get post text from request body

    // Validate post content
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: 'Please provide valid post content'});
    }
    
    try {
        // Create and save new post with userId from the authenticated user
        const newPost = new Post({ userId: req.user.userId, text }); // Create new post instance
        await newPost.save(); // Save post to database
        res.status(201).json({ message: 'Post created successfully', post: newPost }); // Send success response with post data
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' }); // Return 500 Internal Server Error
    }
});

app.get('/posts', authenticateJWT, async (req, res) => {
    try {
        // Fetch posts for the logged-in user
        const posts = await Post.find({ userId: req.user.userId }); // Find posts by userId
        res.status(200).json({ posts }); // Send success response with posts data
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' }); // Return 500 Internal Server Error
    }
});

// Insert your post updation code here.
app.put('/posts/:postId', authenticateJWT, async (req, res) => {
    const postId = req.params.postId; // Get postId from request parameters
    const { text } = req.body; // Get updated post text from request body
    const userId = req.user.userId; // Get userId from authenticated user
    try {
        // Find and update the post, ensuring it's owned by the authenticated user
        const post = await Post.findOneAndUpdate(
            { _id: postId, userId: userId }, // Find post by postId and userId
            { text }, // Update post text
            { new: true } // Return the updated document
        );

        // Return error if post not found or not owned by user
        if (!post) {
            return res.status(404).json({ message: 'Post not found or you do not have permission to update this post' });
        }
        res.status(200).json({ message: 'Post updated successfully', updatedPost: post });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' }); // Return 500 Internal Server Error
    }
});

// Insert your post deletion code here.
app.delete('/posts/:postId', authenticateJWT, async (req, res) => {
    const postId = req.params.postId; // Get postId from request parameters
    const userId = req.user.userId; // Get userId from authenticated user

    try {
        // Find and delete the post, ensuring it's owned by the authenticated user
        const post = await Post.findOneAndDelete({ _id: postId, userId: userId });

        // Return error if post not found
        if (!post) return res.status(404).json({ message: 'Post not found or you do not have permission to delete this post' });

        res.status(200).json({ message: 'Post deleted successfully', deletedPost: post }); // Send success response
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' }); // Return 500 Internal Server Error
    }
});

// Insert your user logout code here.
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error(err); // Log any errors during session destruction
        res.redirect('/login'); // Redirect to login page after logout
    });
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
