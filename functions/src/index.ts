/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

import * as functions from 'firebase-functions';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import * as admin from 'firebase-admin';

admin.initializeApp();

interface RequestBody {
  imageUrl: string;
}

interface PredictionResponse {
  predictions: Array<{
    grade: string;
    feedback: string;
  }>;
}

export const gradeHomework = functions.https.onRequest(async (req, res) => {
  const { imageUrl } = req.body as RequestBody;

  try {
    // Use Vision API for OCR
    const visionClient = new ImageAnnotatorClient();
    const [result] = await visionClient.textDetection(imageUrl);
    const detectedText = result.fullTextAnnotation?.text;

    if (!detectedText) {
      throw new Error('No text detected in the image');
    }

    // Use Vertex AI for grading and feedback
    const predictionClient = new PredictionServiceClient();
    const endpoint = 'YOUR_VERTEX_AI_ENDPOINT';
    const [predictionResponse] = await predictionClient.predict({
      endpoint,
      instances: [{ text: detectedText }],
    }) as [PredictionResponse];

    const grade = predictionResponse.predictions[0].grade;
    const feedback = predictionResponse.predictions[0].feedback;

    // Store result in Firestore
    const db = admin.firestore();
    await db.collection('grades').add({
      imageUrl,
      grade,
      feedback,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ grade, feedback });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});