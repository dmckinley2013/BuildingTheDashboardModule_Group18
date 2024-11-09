const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

// Define the MongoDB schema and model
const messageSchema = new mongoose.Schema({
    time: String,
    job_id: String,
    content_id: String,
    content_type: String,
    file_name: String,
    status: String,
    message: String
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,  // Increased ping timeout
    connectTimeout: 60000,  // Added connection timeout
    transports: ['websocket', 'polling']  // Explicitly specify transports
});

const PORT = process.env.PORT || 5001;

// MongoDB connection configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/dashboard_db';
const MONGODB_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true
};

// Connect to MongoDB with retry logic
const connectWithRetry = () => {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log('Successfully connected to MongoDB');
        })
        .catch(err => {
            console.error('MongoDB connection error:', err);
            console.log('Retrying connection in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
        });
};

connectWithRetry();

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    connectWithRetry();
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Send connection acknowledgment
    socket.emit('connect_confirmation', { 
        status: 'connected', 
        socketId: socket.id 
    });

    // Fetch all messages from the database on client connection
    const fetchInitialMessages = async () => {
        try {
            const messages = await Message.find({})
                .sort({ createdAt: -1 })
                .limit(100);
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
            // Send acknowledgment back to sender
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
                // Send acknowledgment back to sender
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

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    // Handle ping
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// Basic health check endpoint
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

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Performing graceful shutdown...');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
});