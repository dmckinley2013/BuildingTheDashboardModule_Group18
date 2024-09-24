from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError

def connect_to_mongo():
    try:
        # Connect to MongoDB with a 5 second server selection timeout
        client = MongoClient('mongodb://admin:admin@mongo:27017/', serverSelectionTimeoutMS=5000)
        client.server_info()  # Attempt to connect
        db = client['dashboard_db']
        return db
    except ServerSelectionTimeoutError as e:
        print(f"Could not connect to MongoDB: {e}")
        return None

db = connect_to_mongo()
if db:
    messages_collection = db['messages']

def save_message(content):
    """Save a message to the MongoDB collection."""
    if db:
        try:
            result = messages_collection.insert_one(content)
            print(f"Message inserted with ID: {result.inserted_id}")
        except Exception as e:
            print(f"Error inserting message: {e}")

def load_messages(self):
    """Load all messages from the MongoDB collection."""
    if db:
        try:
            messages = list(messages_collection.find({}))
            return messages
        except Exception as e:
            print(f"Error loading messages: {e}")
            return []

def clear_all_messages():
    """Delete all messages from the MongoDB collection."""
    if db:
        try:
            result = messages_collection.delete_many({})
            print(f"Deleted {result.deleted_count} messages.")
        except Exception as e:
            print(f"Error clearing messages: {e}")
