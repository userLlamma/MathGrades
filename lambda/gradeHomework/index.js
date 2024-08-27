const { createClient } = require('@supabase/supabase-js');
const { evaluate } = require('mathjs');
const { Anthropic } = require('@anthropic-ai/sdk');
const { createWorker } = require('tesseract.js');
//require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  let body;
  if (typeof event.body === 'string') {
    // API Gateway 情况：event.body 是字符串，需要解析
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      console.error('Error parsing event body:', error);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }
  } else if (typeof event === 'object' && event !== null) {
    // Lambda 测试情况：整个 event 已经是解析后的对象
    body = event;
  } else {
    console.error('Unexpected event structure');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid event structure' })
    };
  }

  console.log('Processed body:', body);

  try {
    //const { imageUrl, useClaudeApi = false } = JSON.parse(event.body);
    const { imageUrl, useClaudeApi = false } = body;

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

    console.log("Stored result in Supabase with ID:", data[0].id);

    return {
      statusCode: 200,
      body: JSON.stringify({ data: { grade, feedback, ocrResult } }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
      }
    };
  } catch (error) {
    console.error("Error processing homework:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: error.message }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
      }
    };
  }
};

async function performOCR(imageUrl) {
  console.log("Starting OCR process for image:", imageUrl);

  // Fetch the image
  const response = await fetch(imageUrl);
  const imageArrayBuffer = await response.arrayBuffer();

  // Initialize Tesseract worker
  const worker = await createWorker({
    logger: m => console.log(m),
  });

  try {
    // Load image
    await worker.loadImage(Buffer.from(imageArrayBuffer));

    // Perform OCR
    const { data: { text } } = await worker.recognize();

    console.log("OCR process completed");
    return text;
  } finally {
    await worker.terminate();
  }
}

function evaluateMathExpression(input) {
    console.log("Evaluating math expressions:", input);
  
    // Remove extra whitespace
    input = input.replace(/\s+/g, " ").trim();
  
    if (!input) {
      console.log("Empty input");
      return { grade: 0, feedback: "未能识别到任何内容。" };
    }
  
    const lines = input.split(/[,;\n]+/);
  
    let totalGrade = 0;
    let totalExpressions = 0;
    const feedbacks = [];
  
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
  
      try {
        const match = line.match(/^(.+?)(=|!=|<=|>=|<|>)(.+)$/);
  
        if (match) {
          const [, leftSide, operator, rightSide] = match;
          const leftResult = evaluate(leftSide);
          const rightResult = evaluate(rightSide);
  
          let isCorrect = false;
  
          switch (operator) {
            case "=":
              isCorrect = Math.abs(leftResult - rightResult) < 0.0001;
              break;
            case "!=":
              isCorrect = leftResult !== rightResult;
              break;
            case "<":
              isCorrect = leftResult < rightResult;
              break;
            case "<=":
              isCorrect = leftResult <= rightSide;
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
          const result = evaluate(line);
          feedbacks.push(`表达式 "${line}" 的计算结果是 ${result}。`);
          totalGrade += 50;
          totalExpressions++;
        }
      } catch (error) {
        console.error("Error evaluating expression:", line, error);
  
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
          feedbacks.push(`无法解析 "${line}" 为数学表达式。`);
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