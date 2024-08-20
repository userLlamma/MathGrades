import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as math from 'mathjs';
import cors from 'cors';
import Anthropic from "@anthropic-ai/sdk";
import { config } from 'dotenv';

admin.initializeApp();

const corsHandler = cors({ origin: true });

// 本地开发时使用 dotenv
config();

const anthropic = new Anthropic({
  apiKey: process.env.NODE_ENV === 'production'
    ? functions.config().claude.apikey
    : process.env.CLAUDE_API_KEY,
});


interface RequestBody {
  data: {
    imageUrl: string;
    useClaudeApi?: boolean; // 新增参数
  };
}

export const gradeHomework = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    console.log('Received request:', req.body);
    const { data } = req.body as RequestBody;
    const { imageUrl, useClaudeApi = false } = data;

    console.log('Extracted imageUrl:', imageUrl);
    console.log('Using Claude API:', useClaudeApi);

    try {
      let grade: number;
      let feedback: string;

      if (useClaudeApi) {
        // 使用Claude API处理
        console.log('Using Claude API to analyze image:', imageUrl);
        const image_media_type = "image/jpeg"
        const image_array_buffer = await ((await fetch(imageUrl)).arrayBuffer());
        const image_data = Buffer.from(image_array_buffer).toString('base64');
        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 1000,
          temperature: 0,
          system: "You are a Math Teacher. Respond with concise comment.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "请分析这张数学作业图片,给出评分(满分100分)和详细评语。评语应该指出作业的优点和需要改进的地方。"
                },
                {
                  type: "image",
                  source: {
                    "type": "base64",
                    "media_type": image_media_type,
                    "data": image_data,
                  }
                }
              ]
            }
          ]
        });

        const aiResponse = response.content[0].type === 'text' 
          ? response.content[0].text 
          : '';
        console.log('Claude API response:', aiResponse);

        const gradeMatch = aiResponse.match(/评分[:：]\s*(\d+)/);
        grade = gradeMatch ? parseInt(gradeMatch[1]) : 0;
        feedback = aiResponse.replace(/评分[:：]\s*\d+/, '').trim();
      } else {
        // 使用原有的OCR流程
        console.log('Performing OCR on image:', imageUrl);
        const detectedText = await performOCR(imageUrl);

        if (!detectedText) {
          console.error('No text detected in the image');
          throw new Error('No text detected in the image');
        }

        console.log('Detected text:', detectedText);
        grade = evaluateMathExpression(detectedText);
        console.log('Calculated grade:', grade);
        feedback = generateFeedback(grade);
      }

      console.log('Generated feedback:', feedback);

      const db = admin.firestore();
      const docRef = await db.collection('grades').add({
        imageUrl,
        grade,
        feedback,
        timestamp: FieldValue.serverTimestamp(),
      });
      console.log('Stored result in Firestore with ID:', docRef.id);

      res.json({ data: { grade, feedback } });
    } catch (error) {
      console.error('Error processing homework:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: (error as Error).message || 'Unknown error'
      });
    }
  });
});

async function performOCR(imageUrl: string): Promise<string> {
  console.log('Starting OCR process for image:', imageUrl);
  await delay(2000);
  console.log('OCR process completed');
  return '(12+5)*12=';
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evaluateMathExpression(expression: string): number {
  console.log('Evaluating math expression:', expression);
  try {
    // 移除所有空格
    expression = expression.replace(/\s/g, '');
    
    // 检查是否有等号，并分割表达式
    const parts = expression.split('=');
    const leftSide = parts[0];
    const rightSide = parts[1];

    // 评估左侧的表达式
    const result = math.evaluate(leftSide);
    console.log('Evaluation result:', result);

    // 如果有右侧（即原始表达式中有等号），则比较结果
    if (rightSide !== undefined) {
      const expectedResult = parseFloat(rightSide);
      if (Math.abs(result - expectedResult) < 0.0001) { // 使用小的误差范围进行比较
        console.log('Expression is correct');
        return 100; // 或者其他表示正确的分数
      } else {
        console.log('Expression is incorrect');
        return 0; // 或者根据你的评分标准返回一个分数
      }
    }

    return result;
  } catch (error) {
    console.error('Error evaluating math expression:', error);
    throw new Error('Invalid math expression');
  }
}

function generateFeedback(grade: number): string {
  console.log('Generating feedback for grade:', grade);
  if (grade >= 90) {
    return 'Excellent work! Keep it up!';
  } else if (grade >= 80) {
    return 'Good job! There\'s room for improvement.';
  } else if (grade >= 70) {
    return 'You\'re on the right track. Keep practicing!';
  } else {
    return 'Let\'s review this together. Don\'t give up!';
  }
}