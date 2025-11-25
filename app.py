import os
from flask import Flask, render_template, request, jsonify
from rembg import remove, new_session
from PIL import Image
import uuid
import io

app = Flask(__name__)

# CONFIGURATION
UPLOAD_FOLDER = 'static/uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# === OPTIMIZATION: Pre-load the lighter model ===
# 'u2netp' is the lightweight version. It uses much less RAM.
model_name = "u2netp" 
session = new_session(model_name)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/remove-bg', methods=['POST'])
def remove_background():
    if 'image' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        # 1. Limit Image Size before processing (Crucial for RAM)
        input_image = Image.open(file.stream)
        
        # Resize if too big (e.g., > 1500px). 
        # This saves MASSIVE amounts of memory during AI processing.
        max_size = 1500
        if input_image.width > max_size or input_image.height > max_size:
            input_image.thumbnail((max_size, max_size))

        # 2. GENERATE UNIQUE ID
        unique_id = str(uuid.uuid4())
        
        # 3. SAVE ORIGINAL IMAGE
        original_filename = f"{unique_id}_original.png"
        original_path = os.path.join(app.config['UPLOAD_FOLDER'], original_filename)
        input_image.save(original_path)
        
        # 4. RUN AI REMOVAL (Using the lightweight session)
        output_image = remove(input_image, session=session)
        
        # 5. SAVE RESULT IMAGE
        result_filename = f"{unique_id}_result.png"
        result_path = os.path.join(app.config['UPLOAD_FOLDER'], result_filename)
        output_image.save(result_path)
        
        return jsonify({
            'original_url': f"/static/uploads/{original_filename}",
            'result_url': f"/static/uploads/{result_filename}"
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': 'Processing failed. Image might be too complex.'}), 500

if __name__ == '__main__':
    # Use PORT environment variable for Render
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
```

### 🛠️ Fix 2: Update Gunicorn Settings (Concurrency)

Gunicorn defaults to multiple workers (processes). Each worker loads its own copy of the AI model. If you have 2 workers, you use 2x RAM. On the free tier, **we can only afford 1 worker**.

**Action:** You need to update your **Start Command** in the Render Dashboard settings.

1.  Go to Render Dashboard > Stand Out > Settings.
2.  Scroll to **Start Command**.
3.  Change it to this specific command to limit workers and threads:

```bash
gunicorn -w 1 --threads 2 -b 0.0.0.0:10000 app:app
```

* `-w 1`: Only **one** worker process. (Saves RAM).
* `--threads 2`: Allows that one worker to handle 2 things at once (helps if one request is slow).

### 🛠️ Fix 3: Update `requirements.txt`

Since we are specifying a specific model session in the python code, we don't need to change the libraries, but ensuring we are on a compatible version is good. Your existing `requirements.txt` is likely fine, but just double check it has:

```text
Flask
rembg
Pillow
gunicorn
onnxruntime
