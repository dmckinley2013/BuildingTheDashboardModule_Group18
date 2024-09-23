import tkinter as tk
from tkinter import ttk, messagebox
import pika
from bson import BSON
from threading import Thread
from datetime import datetime
import database
import logging
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class DashboardApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Message Dashboard")
        self.geometry("1200x600")

        self.setup_ui()
        self.init_db()
        database.load_messages(self)
        self.start_consuming_thread()

    def setup_ui(self):
        title_frame = tk.Frame(self)
        title_frame.pack(fill=tk.X, padx=10, pady=5)

        title_label = tk.Label(title_frame, text="Message Dashboard", font=('Arial', 16, 'bold'))
        title_label.pack()

        button_frame = tk.Frame(self)
        button_frame.pack(fill=tk.X, padx=10, pady=5)

        clear_button = tk.Button(button_frame, text="Clear All Messages", command=database.clear_all_messages())
        clear_button.pack(side=tk.RIGHT)

        columns = ("Time", "JobID", "ContentID", "ContentType", "FileName", "Status", "Message")
        self.tree = ttk.Treeview(self, columns=columns, show="headings")
        for col in columns:
            self.tree.heading(col, text=col, command=lambda _col=col: self.sort_column(_col, False))
        
        self.tree.column("Time", width=150)
        self.tree.column("JobID", width=200)
        self.tree.column("ContentID", width=200)
        self.tree.column("ContentType", width=100)
        self.tree.column("FileName", width=150)
        self.tree.column("Status", width=150)
        self.tree.column("Message", width=250)

        self.tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        scrollbar.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.bind("<Double-1>", self.on_item_click)

    def start_consuming_thread(self):
        thread = Thread(target=self.consume_messages)
        thread.daemon = True
        thread.start()

    def consume_messages(self):
        try:
            connection_parameters = pika.ConnectionParameters('localhost')
            connection = pika.BlockingConnection(connection_parameters)
            channel = connection.channel()
            
            queue_name = 'Dashboard'
            channel.basic_consume(queue=queue_name, on_message_callback=self.on_message_received, auto_ack=True)
            
            logging.info('Starting Consuming')
            channel.start_consuming()
        except Exception as e:
            logging.error(f"Error consuming messages: {e}")

    def on_message_received(self, ch, method, properties, body):
        try:
            decoded_body = BSON(body).decode()
            logging.info(f"Received new message: {decoded_body}")
            logging.info(f"Routing key: {method.routing_key}")
            
            database.save_message(decoded_body)
            self.display_message(decoded_body)
        except Exception as e:
            logging.error(f"Error processing message: {e}")

    def get_content_info(self, message):
        if 'DocumentId' in message:
            return message['DocumentId'], 'Document'
        elif 'PictureID' in message:
            return message['PictureID'], 'Picture'
        elif 'AudioID' in message:
            return message['AudioID'], 'Audio'
        elif 'VideoID' in message:
            return message['VideoID'], 'Video'
        else:
            return 'Unknown ContentID', 'Unknown Type'

    def load_messages(self):
        rows = database.load_messages(self)
        for row in rows:
            self.tree.insert("", tk.END, values=row)

    def display_message(self, message):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        job_id = message.get('ID', 'Unknown JobID')
        content_id, content_type = self.get_content_info(message)
        file_name = message.get('FileName', 'Unknown File')
        status = message.get('Status', 'Unknown Status')
        message_text = message.get('Message', 'No message')

        self.tree.insert("", tk.END, values=(timestamp, job_id, content_id, content_type, file_name, status, message_text))
        logging.info(f"Displayed message: {job_id}")

    def sort_column(self, col, reverse):
        l = [(self.tree.set(k, col), k) for k in self.tree.get_children('')]
        l.sort(reverse=reverse)

        for index, (val, k) in enumerate(l):
            self.tree.move(k, '', index)

        self.tree.heading(col, command=lambda: self.sort_column(col, not reverse))

    def on_item_click(self, event):
        item = self.tree.selection()[0]
        message = self.tree.item(item, "values")
        
        popup = tk.Toplevel(self)
        popup.title("Message Details")
        popup.geometry("500x300")
        
        text = tk.Text(popup, wrap=tk.WORD)
        text.pack(fill=tk.BOTH, expand=True)
        
        columns = ["Time", "JobID", "ContentID", "ContentType", "FileName", "Status", "Message"]
        for i, column in enumerate(columns):
            text.insert(tk.END, f"{column}: {message[i]}\n\n")
        
        text.config(state=tk.DISABLED)


if __name__ == "__main__":
    app = DashboardApp()
    app.mainloop()