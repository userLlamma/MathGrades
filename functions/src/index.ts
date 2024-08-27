import {FieldValue} from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as math from "mathjs";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import {config} from "dotenv";
import {createWorker} from "tesseract.js";

admin.initializeApp();

const corsHandler = cors({origin: true});

// 本地开发时使用 dotenv
config();

const anthropic = new Anthropic({
  apiKey: process.env.NODE_ENV === "production" ?
    functions.config().claude.apikey :
    process.env.CLAUDE_API_KEY,
});


interface RequestBody {
  data: {
    imageUrl: string;
    useClaudeApi?: boolean; // 新增参数
  };
}

interface EvaluationResult {
  grade: number;
  feedback: string;
}

export const gradeHomework = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    console.log("Received request:", req.body);
    const {data} = req.body as RequestBody;
    const {imageUrl, useClaudeApi = false} = data;

    console.log("Extracted imageUrl:", imageUrl);
    console.log("Using Claude API:", useClaudeApi);

    let ocrResult = "";
    let grade: number;
    let feedback: string;

    try {
      if (useClaudeApi) {
        // 使用Claude API处理
        console.log("Using Claude API to analyze image:", imageUrl);
        const imageMediaType = "image/jpeg";
        const imageArrayBuffer = await ((await fetch(imageUrl)).arrayBuffer());
        const imageData = Buffer.from(imageArrayBuffer).toString("base64");
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
                  text: "请分析这张数学作业图片,给出评分(满分100分)和详细评语。评语应该指出作业的优点和需要改进的地方。",
                },
                {
                  type: "image",
                  source: {
                    "type": "base64",
                    "media_type": imageMediaType,
                    "data": imageData,
                  },
                },
              ],
            },
          ],
        });

        const aiResponse = response.content[0].type === "text" ?
          response.content[0].text :
          "";
        console.log("Claude API response:", aiResponse);

        const gradeMatch = aiResponse.match(/评分[:：]\s*(\d+)/);
        grade = gradeMatch ? parseInt(gradeMatch[1]) : 0;
        feedback = aiResponse.replace(/评分[:：]\s*\d+/, "").trim();
      } else {
        // 使用原有的OCR流程
        console.log("Performing OCR on image:", imageUrl);
        ocrResult = await performOCR(imageUrl);

        if (!ocrResult) {
          console.error("No text detected in the image");
          throw new Error("No text detected in the image");
        }

        console.log("Detected text:", ocrResult);
        const result = evaluateMathExpression(ocrResult);
        grade = result.grade;
        feedback = result.feedback;
        console.log("Calculated grade:", grade);
      }

      console.log("Generated feedback:", feedback);

      const db = admin.firestore();
      const docRef = await db.collection("grades").add({
        imageUrl,
        grade,
        feedback,
        ocrResult,
        timestamp: FieldValue.serverTimestamp(),
      });
      console.log("Stored result in Firestore with ID:", docRef.id);
      console.log("ocrResult:", ocrResult);

      res.json({data: {grade, feedback, ocrResult}});
    } catch (error) {
      console.error("Error processing homework:", error);
      res.status(500).json({
        error: "Internal server error",
        details: (error as Error).message || "Unknown error",
      });
    }
  });
});


/**
 * Performs Optical Character Recognition (OCR) on an image.
 * @param {string} imageUrl - The URL of the image to perform OCR on.
 * @return {Promise<string>} A promise that resolves to the recognized text.
 */
async function performOCR(imageUrl: string): Promise<string> {
  console.log("Starting Math OCR process for image:", imageUrl);

  const worker = await createWorker(["eng", "chi_sim"]);

  try {
    const {data: {text}} = await worker.recognize(imageUrl);

    console.log("Math OCR process completed");

    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Performs Optical Character Recognition (OCR) on an image.
 * @param {string} input - OCR result.
 * @return {EvaluationResult}        grading struct result
 * interface EvaluationResult {
 * grade: number;
 * feedback: string;
 * }
 */
function evaluateMathExpression(input: string): EvaluationResult {
  console.log("Evaluating math expressions:", input);

  // 移除多余的空白字符
  input = input.replace(/\s+/g, " ").trim();

  // 如果输入为空，返回 0 分
  if (!input) {
    console.log("Empty input");
    return {grade: 0, feedback: "未能识别到任何内容。"};
  }

  // 分割输入为单独的行或表达式
  const lines: string[] = input.split(/[,;\n]+/);

  let totalGrade = 0;
  let totalExpressions = 0;
  const feedbacks: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    try {
      // 尝试匹配等式或不等式
      const match: RegExpMatchArray | null = line.match(
        /^(.+?)(=|!=|<=|>=|<|>)(.+)$/
      );

      if (match) {
        const [, leftSide, operator, rightSide] = match;
        const leftResult: number = math.evaluate(leftSide);
        const rightResult: number = math.evaluate(rightSide);

        let isCorrect = false;

        switch (operator) {
        case "=":
          isCorrect = Math.abs(leftResult - rightResult) < 0.0001; break;
        case "!=":
          isCorrect = leftResult !== rightResult; break;
        case "<":
          isCorrect = leftResult < rightResult; break;
        case "<=":
          isCorrect = leftResult <= rightResult; break;
        case ">":
          isCorrect = leftResult > rightResult; break;
        case ">=":
          isCorrect = leftResult >= rightResult; break;
        }

        if (isCorrect) {
          totalGrade += 100;
          feedbacks.push(`表达式 "${line}" 正确！`);
        } else {
          feedbacks.push(
            `表达式 "${line}" 不正确。` +
            `左边 = ${leftResult}，右边 = ${rightResult}`
          );
        }
        totalExpressions++;
      } else {
        // 尝试直接计算表达式
        const result: number = math.evaluate(line);
        feedbacks.push(`表达式 "${line}" 的计算结果是 ${result}。`);
        totalGrade += 50; // 给予部分分数，因为我们不确定预期结果
        totalExpressions++;
      }
    } catch (error) {
      console.error("Error evaluating expression:", line, error);

      // 尝试提取数字
      const numbers: string[] | null = line.match(/[-+]?\d*\.?\d+/g);
      if (numbers && numbers.length > 0) {
        const sum: number = numbers.reduce(
          (acc, num) => acc + parseFloat(num), 0
        );
        feedbacks.push(
          `在 "${line}" 中找到了以下数字：${numbers.join(", ")}。`+
          `这些数字的和是 ${sum}。`
        );
        totalGrade += 25; // 给予少量分数
        totalExpressions++;
      } else {
        feedbacks.push(`无法解析 "${line}" 为数学表达式。`);
      }
    }
  }

  // 计算平均分
  const averageGrade: number =
   totalExpressions > 0 ? Math.round(totalGrade / totalExpressions) : 0
  ;

  // 组合反馈
  const combinedFeedback: string = feedbacks.join("\n");

  return {
    grade: averageGrade,
    feedback: `总体得分：${averageGrade}\n\n详细反馈：\n${combinedFeedback}`,
  };
}

