import os
import psutil
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__)

def get_system_info():
    temp = os.popen("vcgencmd measure_temp").readline()
    return {
        "cpu_percent": psutil.cpu_percent(),
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
        "temp": temp.replace("temp=", "").replace("'C\n", "")
    }

@app.route('/api/status')
def status():
    return jsonify(get_system_info())

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
