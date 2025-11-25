import os
from flask import Flask, render_template, request, jsonify
from rembg import remove
from PIL import Image
import uuid

app = Flask(__name__)

# CONFIGURATION
UPLOAD_FOLDER = 'static/uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

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
        # 1. Open the image
        input_image = Image.open(file.stream)
        
        # 2. GENERATE UNIQUE ID
        unique_id = str(uuid.uuid4())
        
        # 3. SAVE ORIGINAL IMAGE (For Comparison)
        original_filename = f"{unique_id}_original.png"
        original_path = os.path.join(app.config['UPLOAD_FOLDER'], original_filename)
        input_image.save(original_path)
        
        # 4. RUN AI REMOVAL
        output_image = remove(input_image)
        
        # 5. SAVE RESULT IMAGE
        result_filename = f"{unique_id}_result.png"
        result_path = os.path.join(app.config['UPLOAD_FOLDER'], result_filename)
        output_image.save(result_path)
        
        # 6. RETURN BOTH URLS
        return jsonify({
            'original_url': f"/static/uploads/{original_filename}",
            'result_url': f"/static/uploads/{result_filename}"
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': 'Processing failed'}), 500

if __name__ == '__main__':
    app.run(debug=True)