from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient('mongodb://mongo:27017/')
db = client['dashboard_db']
messages_collection = db['messages']

def save_message(content):
    result = messages_collection.insert_one(content)
    print(f"Message inserted with ID: {result.inserted_id}")
