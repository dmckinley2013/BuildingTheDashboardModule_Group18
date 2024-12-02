from pymongo import MongoClient
from bson import BSON
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class DBHandler:
    def __init__(self):
        self.client = None
        self.db = None
        self.collection = None
        self.start_time = datetime.now()

    def init_db(self):
        """Initialize database connection."""
        try:
            self.client = MongoClient('mongodb://localhost:27017/')
            self.db = self.client['dashboard_db']
            self.collection = self.db['messages']
            logging.info("Connected to MongoDB successfully")
        except Exception as e:
            logging.error(f"Failed to connect to MongoDB: {e}")
            raise

    def save_message_to_db(self, message):
        """Save a message to the database."""
        try:
            # Debug log the incoming message
            logging.info(f"Attempting to save message: {message}")
            
            # If message is BSON, decode it
            if isinstance(message, bytes):
                message = BSON(message).decode()

            # Extract or generate the timestamp
            timestamp = message.get('time')
            if not timestamp:
                timestamp = datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')

            # Create document with proper field mapping
            document = {
                "time": timestamp,
                "job_id": message.get('job_id') or message.get('ID', 'Unknown JobID'),
                "content_id": (message.get('content_id') or 
                             message.get('DocumentId') or 
                             message.get('PictureID') or 
                             message.get('AudioID', 'Unknown ContentID')),
                "content_type": message.get('content_type') or self._determine_content_type(message),
                "file_name": message.get('file_name') or message.get('FileName', 'Unknown File'),
                "status": message.get('status', 'Processed'),
                "message": message.get('message', 'No additional information')
            }

            # Only save if we have valid data
            if self._is_valid_document(document):
                self.collection.insert_one(document)
                logging.info(f"Successfully saved message to MongoDB: {document}")
            else:
                logging.warning(f"Skipping invalid document: {document}")

        except Exception as e:
            logging.error(f"Failed to save message to MongoDB: {e}")
            raise

    def _determine_content_type(self, message):
        """Determine content type from message structure."""
        if 'DocumentId' in message:
            return 'Document'
        elif 'PictureID' in message:
            return 'Picture'
        elif 'AudioID' in message:
            return 'Audio'
        return message.get('content_type', 'Unknown Type')

    def _is_valid_document(self, document):
        """Check if document has valid data."""
        return (
            document['job_id'] != 'Unknown JobID' or
            document['content_id'] != 'Unknown ContentID' or
            document['content_type'] != 'Unknown Type'
        )

    def load_messages(self):
        """Load messages from the database."""
        try:
            # Get messages and sort by time in descending order
            messages = list(self.collection.find(
                {
                    "$or": [
                        {"job_id": {"$ne": "Unknown JobID"}},
                        {"content_id": {"$ne": "Unknown ContentID"}},
                        {"content_type": {"$ne": "Unknown Type"}}
                    ]
                },
                {'_id': 0}
            ).sort("time", -1))
            
            logging.info(f"Successfully loaded {len(messages)} messages from MongoDB")
            return messages
        except Exception as e:
            logging.error(f"Failed to load messages from MongoDB: {e}")
            return []

    def clear_invalid_messages(self):
        """Clear invalid messages from the database."""
        try:
            result = self.collection.delete_many({
                "$and": [
                    {"job_id": "Unknown JobID"},
                    {"content_id": "Unknown ContentID"},
                    {"content_type": "Unknown Type"}
                ]
            })
            logging.info(f"Cleared {result.deleted_count} invalid messages from MongoDB")
        except Exception as e:
            logging.error(f"Failed to clear invalid messages: {e}")

    async def get_avg_processing_time(self):
        result = await self.db.analytics.aggregate([
            {"$group": {"_id": None, "avg_time": {"$avg": "$processing_time"}}}
        ]).to_list(1)
        return result[0]["avg_time"] if result else 0

    async def get_peak_throughput(self):
        # Files processed per minute in peak period
        pipeline = [
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d %H:%M", "date": "$timestamp"}},
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}},
            {"$limit": 1}
        ]
        result = await self.db.analytics.aggregate(pipeline).to_list(1)
        return result[0]["count"] if result else 0

    async def get_total_files(self):
        return await self.db.analytics.count_documents({})

    async def get_file_distribution(self):
        result = await self.db.analytics.aggregate([
            {"$group": {"_id": "$file_type", "count": {"$sum": 1}}}
        ]).to_list(None)
        return {doc["_id"]: doc["count"] for doc in result}

    async def get_largest_file_size(self):
        result = await self.db.analytics.find_one(
            sort=[("file_size", -1)]
        )
        return result["file_size"] if result else 0

    async def get_avg_file_size(self):
        result = await self.db.analytics.aggregate([
            {"$group": {"_id": None, "avg_size": {"$avg": "$file_size"}}}
        ]).to_list(1)
        return result[0]["avg_size"] if result else 0

    async def get_queue_depth(self):
        return await self.db.queue.count_documents({"status": "pending"})

    async def get_success_rate(self):
        total = await self.db.analytics.count_documents({})
        if total == 0:
            return 100
        success = await self.db.analytics.count_documents({"status": "success"})
        return (success / total) * 100