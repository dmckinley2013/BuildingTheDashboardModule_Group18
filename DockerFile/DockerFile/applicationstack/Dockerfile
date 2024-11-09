# Use the official Python image as the base image
FROM python:3.10

# Install Node.js (version 16) and npm
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy application files and install dependencies
COPY react_frontend/ /app/react_frontend/
COPY requirements.txt /app/

# Install Python dependencies
RUN pip3 install --upgrade pip && \
    pip3 install -r /app/requirements.txt

# Force cache-bust for npm install by copying package.json separately
COPY react_frontend/package.json /app/react_frontend/package.json
RUN npm install --prefix /app/react_frontend/

# Copy the rest of the frontend files and build the React frontend
COPY react_frontend/ /app/react_frontend/
RUN npm run build --prefix /app/react_frontend/

# Install serve to host the React build
RUN npm install -g serve

# Create the logs directory and copy backend files
RUN mkdir -p /app/logs
COPY Parser_Module/ /app/Parser_Module/
COPY WebSocket_Backend/ /app/WebSocket_Backend/

# Force cache-bust for backend npm install by copying package.json separately
COPY WebSocket_Backend/package.json /app/WebSocket_Backend/package.json
RUN npm install express socket.io mongoose --prefix /app/WebSocket_Backend/

# Create and configure the startup script
RUN echo '#!/bin/bash\n\
# Serve the React frontend first\n\
serve -s /app/react_frontend/build -l 3000 &\n\
sleep 60  # Increase delay to ensure frontend is served before backend services start\n\
# Start the WebSocket backend server\n\
node /app/WebSocket_Backend/server.js &\n\
sleep 5\n\
# Start the parser module\n\
python3 /app/Parser_Module/parse.py &\n\
sleep 5\n\
# Start the WebSocket server (if needed for UI communication)\n\
python3 /app/WebSocket_Backend/websocket_server.py &\n\
wait' > /app/start.sh && chmod +x /app/start.sh

# Expose the necessary ports
EXPOSE 3000 5000 5001

# Set the entry point
CMD ["/app/start.sh"]
