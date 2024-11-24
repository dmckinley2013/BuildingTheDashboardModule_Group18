const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

// MongoDB URI and connection options
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/dashboard_db';
const MONGODB_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    socketTimeoutMS: 60000, // Timeout for inactive sockets (60 seconds)
    connectTimeoutMS: 30000 // Timeout for initial connection (30 seconds)
};

// Define the MongoDB schema and model
const messageSchema = new mongoose.Schema({
    time: String,
    job_id: String,
    content_id: String,
    content_type: String,
    file_name: String,
    status: String,
    message: String
}, { timestamps: true }); // This enables `createdAt` and `updatedAt` fields


const Message = mongoose.model('Message', messageSchema);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    connectTimeout: 60000,
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 5001;

// MongoDB connection with retry logic
const connectWithRetry = () => {
    console.log('Attempting to connect to MongoDB...');
    mongoose.connect(MONGODB_URI, MONGODB_OPTIONS)
        .then(() => {
            console.log('Successfully connected to MongoDB');
        })
        .catch((err) => {
            console.error('MongoDB connection error:', err);
            console.log('Retrying connection in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
        });
};

// Initialize MongoDB connection
connectWithRetry();

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected. Attempting to reconnect...');
    connectWithRetry();
});

// Graceful shutdown for MongoDB connection
const gracefulShutdown = (msg, callback) => {
    mongoose.connection.close(false, () => {
        console.log(`Mongoose disconnected through ${msg}`);
        callback();
    });
};

process.on('SIGINT', () => gracefulShutdown('app termination', () => process.exit(0)));
process.on('SIGTERM', () => gracefulShutdown('Heroku app shutdown', () => process.exit(0)));

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Send connection acknowledgment
    socket.emit('connect_confirmation', {
        status: 'connected',
        socketId: socket.id
    });

    // Fetch initial messages from MongoDB
    const fetchInitialMessages = async () => {
        try {
            console.log('Attempting to fetch initial messages from MongoDB...');
            const messages = await Message.find({}).lean().exec();
            console.log("Messages fetched for client:", messages);

            if (messages.length === 0) {
                console.warn('No messages found in MongoDB.');
            } else {
                console.log(`Fetched ${messages.length} messages from MongoDB`);
            }
    
            socket.emit('initialMessages', messages);
            console.log('Initial messages sent to client');
        } catch (err) {
            console.error('Error fetching initial messages:', err);
            socket.emit('error', 'Error loading initial messages');
        }
    };

    fetchInitialMessages();

    // Handle new messages
    socket.on('newMessage', async (msg) => {
        try {
            console.log('Received new message:', msg);
            const newMessage = new Message(msg);
            await newMessage.save();
            io.emit('newMessage', msg); // Broadcast to all clients
            console.log('New message saved and broadcasted:', msg);
            socket.emit('messageSaved', {
                status: 'success',
                message: msg
            });
        } catch (err) {
            console.error('Error saving new message:', err);
            socket.emit('error', {
                type: 'SaveError',
                message: 'Error saving message',
                details: err.message
            });
        }
    });

    // Handle message updates
    socket.on('updateMessage', async (data) => {
        try {
            const { messageId, updates } = data;
            const updatedMessage = await Message.findByIdAndUpdate(
                messageId,
                updates,
                { new: true }
            );
            if (updatedMessage) {
                io.emit('messageUpdated', updatedMessage);
                console.log('Message updated:', messageId);
                socket.emit('updateConfirmation', {
                    status: 'success',
                    messageId: messageId
                });
            } else {
                socket.emit('error', {
                    type: 'UpdateError',
                    message: 'Message not found'
                });
            }
        } catch (err) {
            console.error('Error updating message:', err);
            socket.emit('error', {
                type: 'UpdateError',
                message: 'Error updating message',
                details: err.message
            });
        }
    });

    // Handle client disconnect
    socket.on('disconnect', (reason) => {
        console.log(`Client disconnected. Reason: ${reason}`, socket.id);
    });

    // Handle socket errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    // Handle ping-pong for connection health checks
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        mongoConnection: mongoose.connection.readyState === 1,
        socketServer: io.engine.clientsCount >= 0
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`MongoDB URI: ${MONGODB_URI}`);
});
