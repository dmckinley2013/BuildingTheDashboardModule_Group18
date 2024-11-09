import asyncio
import json
import pika
from datetime import datetime
import logging
from db_handler import DBHandler
import socketio
import aiohttp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class MessageProcessor:
    def __init__(self):
        self.db_handler = DBHandler()
        self.db_handler.init_db()
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=5,
            reconnection_delay=1,
            reconnection_delay_max=5,
            logger=True,
            engineio_logger=True
        )
        self.connect_socketio()

    def connect_socketio(self):
        try:
            self.sio.connect(
                'http://app-stack:5001',
                transports=['websocket', 'polling'],
                namespaces=['/'],
                wait_timeout=10
            )
            logging.info("Connected to Socket.IO server")

            @self.sio.event
            def connect():
                logging.info("SocketIO connected successfully")

            @self.sio.event
            def disconnect():
                logging.info("SocketIO disconnected")
                
            @self.sio.event
            def connect_error(data):
                logging.error(f"SocketIO connection error: {data}")

        except Exception as e:
            logging.error(f"Failed to connect to Socket.IO server: {e}")

    def convert_message_to_json(self, message):
        """Convert RabbitMQ message to standardized JSON format."""
        try:
            if isinstance(message, dict):
                data = message
            elif isinstance(message, str):
                data = json.loads(message)
            elif isinstance(message, bytes):
                data = json.loads(message.decode('utf-8'))
            else:
                raise ValueError(f"Unsupported message type: {type(message)}")

            converted_message = {
                "time": data.get('time') or datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p'),
                "job_id": data.get('job_id') or data.get('ID', 'Unknown JobID'),
                "content_id": (data.get('content_id') or 
                             data.get('DocumentId') or 
                             data.get('PictureID') or 
                             data.get('AudioID', 'Unknown ContentID')),
                "content_type": data.get('content_type') or self._determine_content_type(data),
                "file_name": data.get('file_name') or data.get('FileName', 'Unknown File'),
                "status": data.get('status', 'Processed'),
                "message": data.get('message', 'No additional information')
            }
            return converted_message
        except Exception as e:
            logging.error(f"Error converting message to JSON: {e}")
            raise

    def _determine_content_type(self, message):
        if 'DocumentId' in message:
            return 'Document'
        elif 'PictureID' in message:
            return 'Picture'
        elif 'AudioID' in message:
            return 'Audio'
        return message.get('content_type', 'Unknown Type')

    async def consume_rabbitmq(self):
        try:
            for i in range(5):
                try:
                    credentials = pika.PlainCredentials('guest', 'guest')
                    parameters = pika.ConnectionParameters(
                        host='rabbitmq_tshark',
                        port=5672,
                        credentials=credentials,
                        heartbeat=600,
                        connection_attempts=3
                    )
                    connection = pika.BlockingConnection(parameters)
                    logging.info("Successfully connected to RabbitMQ")
                    break
                except Exception as e:
                    logging.error(f"Failed to connect to RabbitMQ (attempt {i+1}): {e}")
                    if i < 4:
                        await asyncio.sleep(5)
                    else:
                        raise

            channel = connection.channel()
            queue_name = 'Dashboard'
            
            channel.queue_declare(queue=queue_name, durable=True)
            
            def callback(ch, method, properties, body):
                try:
                    message = json.loads(body.decode())
                    json_message = self.convert_message_to_json(message)
                    logging.info(f"Received RabbitMQ message: {json_message}")
                    self.db_handler.save_message_to_db(json_message)
                    
                    # Emit to Socket.IO server
                    if self.sio.connected:
                        self.sio.emit('newMessage', json_message)
                    else:
                        logging.warning("Socket.IO not connected, attempting reconnection...")
                        self.connect_socketio()
                        
                except Exception as e:
                    logging.error(f"Error processing RabbitMQ message: {e}")

            channel.basic_consume(
                queue=queue_name,
                on_message_callback=callback,
                auto_ack=True
            )
            
            logging.info("Connected to RabbitMQ, waiting for messages...")
            channel.start_consuming()

        except Exception as e:
            logging.error(f"Error in RabbitMQ consumer: {e}")

    async def start(self):
        await self.consume_rabbitmq()

if __name__ == "__main__":
    processor = MessageProcessor()
    try:
        asyncio.run(processor.start())
    except KeyboardInterrupt:
        logging.info("Server shutting down...")
    finally:
        if hasattr(processor, 'db_handler'):
            processor.db_handler.close()
        if hasattr(processor, 'sio'):
            processor.sio.disconnect()