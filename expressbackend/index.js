const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { evaluate } = require('mathjs');
const { Anthropic } = require('@anthropic-ai/sdk');
const { createWorker } = require('tesseract.js');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

console.log("supabaseUrl="+supabaseUrl);
console.log("supabaseServiceRoleKey="+supabaseServiceRoleKey);

const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

app.use(express.json());

app.use(cors({
    origin: '*', // 允许来自特定域的请求
    methods: ['GET', 'POST'],     // 允许的 HTTP 方法
    allowedHeaders: ['Content-Type', 'Authorization'] // 允许的头部
}));

app.post('/grade-homework', async (req, res) => {
  try {
    const { imageUrl, useClaudeApi = false } = req.body;

    console.log("Extracted imageUrl:", imageUrl);
    console.log("Using Claude API:", useClaudeApi);

    let ocrResult = "";
    let grade;
    let feedback;

    if (useClaudeApi) {
      // Use Claude API
      console.log("Using Claude API to analyze image:", imageUrl);
      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
      });

      const imageMediaType = "image/jpeg";
      const imageArrayBuffer = await (await fetch(imageUrl)).arrayBuffer();
      const imageData = Buffer.from(imageArrayBuffer).toString('base64');

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
                  type: "base64",
                  media_type: imageMediaType,
                  data: imageData,
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
      // Use OCR and math evaluation
      console.log("Performing OCR on image:", imageUrl);
      ocrResult = await performOCR(imageUrl);

      if (!ocrResult) {
        throw new Error("No text detected in the image");
      }

      console.log("Detected text:", ocrResult);
      const result = evaluateMathExpression(ocrResult);
      grade = result.grade;
      feedback = result.feedback;
      console.log("Calculated grade:", grade);
    }

    console.log("Generated feedback:", feedback);

    try {
      const { data, error } = await supabaseClient
        .from('grades')
        .insert({
          image_url: imageUrl,
          grade,
          feedback,
          ocr_result: ocrResult,
        })
        .select();
    
      if (error) throw error;
    
      if (!data || data.length === 0) {
        throw new Error('Data was inserted but not returned.');
      }
    
      console.log('Inserted data:', data[0]);

      console.log("Stored result in Supabase with ID:", data[0].id);

      res.json({ data: { grade, feedback, ocrResult } });
    } catch (error) {
      console.error('Error inserting grade:', error.message);
      // 根据错误类型提供更具体的错误信息
      if (error.code === '23505') {
        console.error('Unique constraint violated. This record may already exist.');
      } else if (error.code === '42501') {
        console.error('Permission denied. Check your table permissions.');
      } else if (error.code === '23502') {
        console.error('Not null constraint violated. Check if all required fields are provided.');
      }
      // 可以选择重新抛出错误或返回一个错误对象
      throw error;
    }
  } catch (error) {
    console.error("Error processing homework:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Performs Optical Character Recognition (OCR) on an image.
 * @param {string} imageUrl - The URL of the image to perform OCR on.
 * @return {Promise<string>} A promise that resolves to the recognized text.
 */
async function performOCR(imageUrl) {
    console.log("Starting OCR process for image:", imageUrl)


    try {
        // Extract bucket and file path from the URL
        const url = new URL(imageUrl)
        const pathParts = url.pathname.split('/')
        const bucketName = pathParts[5]
        const filePath = pathParts.slice(6).join('/')
        console.log("url="+url);
        console.log("pathParts="+pathParts);
        console.log("bucketName="+bucketName);
        console.log("filePath="+filePath);    

        // Download the file from Supabase storage
        const { data, error } = await supabaseClient
            .storage
            .from(bucketName)
            .download(filePath)

        if (error) {
            throw new Error(`Failed to download image: ${error.message}`)
        }

        // Convert the downloaded data to a Blob
        // Convert the downloaded data to a Buffer
        const buffer = Buffer.from(await data.arrayBuffer());

        // Initialize Tesseract worker
        const worker = await createWorker(['eng', 'chi_sim'])

        try {
            // Perform OCR
            const { data: { text } } = await worker.recognize(buffer)
            console.log("OCR process completed")
            return text
        } finally {
            await worker.terminate()
        }
    } catch (error) {
        console.error("Error in OCR process:", error)
        throw error
    }
}

function evaluateMathExpression(input) {
  console.log("Evaluating expressions:", input);

  // 移除额外的空白字符
  input = input.replace(/\s+/g, " ").trim();

  if (!input) {
    console.log("Empty input");
    return { grade: 0, feedback: "未能识别到任何内容。" };
  }

  // 使用更灵活的分隔符
  const lines = input.split(/[,;\n]+/).filter(line => line.trim());

  let totalGrade = 0;
  let totalExpressions = 0;
  const feedbacks = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    try {
      // 尝试匹配数学表达式
      const match = line.match(/^(.+?)(=|!=|<=|>=|<|>)(.+)$/);

      if (match) {
        const [, leftSide, operator, rightSide] = match;
        let leftResult, rightResult;

        try {
          leftResult = evaluate(leftSide);
          rightResult = evaluate(rightSide);
        } catch (evalError) {
          throw new Error("无法评估表达式的一部分或全部");
        }

        let isCorrect = false;

        switch (operator) {
          case "=":
            isCorrect = Math.abs(leftResult - rightResult) < 0.0001;
            break;
          case "!=":
            isCorrect = Math.abs(leftResult - rightResult) >= 0.0001;
            break;
          case "<":
            isCorrect = leftResult < rightResult;
            break;
          case "<=":
            isCorrect = leftResult <= rightResult;
            break;
          case ">":
            isCorrect = leftResult > rightResult;
            break;
          case ">=":
            isCorrect = leftResult >= rightResult;
            break;
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
        // 尝试评估单个表达式
        try {
          const result = evaluate(line);
          feedbacks.push(`表达式 "${line}" 的计算结果是 ${result}。`);
          totalGrade += 50;
          totalExpressions++;
        } catch (evalError) {
          throw new Error("无法评估表达式");
        }
      }
    } catch (error) {
      console.error("Error evaluating expression:", line, error);

      // 尝试从文本中提取数字
      const numbers = line.match(/[-+]?\d*\.?\d+/g);
      if (numbers && numbers.length > 0) {
        const sum = numbers.reduce(
          (acc, num) => acc + parseFloat(num), 0
        );
        feedbacks.push(
          `在 "${line}" 中找到了以下数字：${numbers.join(", ")}。` +
          `这些数字的和是 ${sum}。`
        );
        totalGrade += 25;
        totalExpressions++;
      } else {
        // 如果没有找到数字，将其视为普通文本
        feedbacks.push(`"${line}" 似乎是文本内容，而非数学表达式。`);
      }
    }
  }

  const averageGrade =
    totalExpressions > 0 ? Math.round(totalGrade / totalExpressions) : 0;

  const combinedFeedback = feedbacks.join("\n");

  return {
    grade: averageGrade,
    feedback: `总体得分：${averageGrade}\n\n详细反馈：\n${combinedFeedback}`,
  };
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});