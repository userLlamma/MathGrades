const imageUpload = document.getElementById('imageUpload');
const uploadButton = document.getElementById('uploadButton');
const resultDiv = document.getElementById('result');

uploadButton.addEventListener('click', async () => {
    const file = imageUpload.files[0];
    if (!file) {
        alert('Please select an image first.');
        return;
    }

    try {
        // Upload image to Firebase Storage
        const storageRef = firebase.storage().ref('homework/' + file.name);
        await storageRef.put(file);
        const imageUrl = await storageRef.getDownloadURL();

        // Call Cloud Function to process image
        const result = await fetch('/gradeHomework', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageUrl }),
        }).then(res => res.json());

        // Display result
        resultDiv.innerHTML = `
            <h2>Grade: ${result.grade}</h2>
            <p>Feedback: ${result.feedback}</p>
        `;
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }
});