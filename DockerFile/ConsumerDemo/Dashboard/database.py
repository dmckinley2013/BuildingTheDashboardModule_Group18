from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient('mongodb://mongo:27017/')
db = client['dashboard_db']
messages_collection = db['messages']


def save_message(content):
    result = messages_collection.insert_one(content)
    print(f"Message inserted with ID: {result.inserted_id}")


def load_messages(self):
    """Load all messages from the MongoDB collection."""
    messages = list(messages_collection.find({}))
    return messages


def clear_all_messages():
    """Delete all messages from the MongoDB collection."""
    result = messages_collection.delete_many({})
    print(f"Deleted {result.deleted_count} messages.")