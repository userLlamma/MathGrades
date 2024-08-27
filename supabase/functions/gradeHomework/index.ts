import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { evaluate } from "https://esm.sh/mathjs@13.0.2"
import { Anthropic } from "https://esm.sh/@anthropic-ai/sdk@0.26.1"
import { createWorker } from "https://esm.sh/tesseract.js@5.1.0"

// CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageUrl, useClaudeApi = false } = await req.json()

    console.log("Extracted imageUrl:", imageUrl)
    console.log("Using Claude API:", useClaudeApi)

    let ocrResult = ""
    let grade: number
    let feedback: string

    if (useClaudeApi) {
      // Use Claude API
      console.log("Using Claude API to analyze image:", imageUrl)
      const anthropic = new Anthropic({
        apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
      })

      const imageMediaType = "image/jpeg"
      const imageArrayBuffer = await (await fetch(imageUrl)).arrayBuffer()
      const imageData = btoa(String.fromCharCode(...new Uint8Array(imageArrayBuffer)))

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
      })

      const aiResponse = response.content[0].type === "text" ?
        response.content[0].text :
        ""
      console.log("Claude API response:", aiResponse)

      const gradeMatch = aiResponse.match(/评分[:：]\s*(\d+)/)
      grade = gradeMatch ? parseInt(gradeMatch[1]) : 0
      feedback = aiResponse.replace(/评分[:：]\s*\d+/, "").trim()
    } else {
      // Use OCR and math evaluation
      console.log("Performing OCR on image:", imageUrl)
      ocrResult = await performOCR(imageUrl)

      if (!ocrResult) {
        throw new Error("No text detected in the image")
      }

      console.log("Detected text:", ocrResult)
      const result = evaluateMathExpression(ocrResult)
      grade = result.grade
      feedback = result.feedback
      console.log("Calculated grade:", grade)
    }

    console.log("Generated feedback:", feedback)

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseClient
      .from('grades')
      .insert({
        image_url: imageUrl,
        grade,
        feedback,
        ocr_result: ocrResult,
      })
      .select()

    if (error) throw error

    console.log("Stored result in Supabase with ID:", data[0].id)

    return new Response(
      JSON.stringify({ data: { grade, feedback, ocrResult } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Error processing homework:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

async function performOCR(imageUrl: string): Promise<string> {
  console.log("Starting OCR process for image:", imageUrl)

  // Fetch the image
  const response = await fetch(imageUrl);
  const imageArrayBuffer = await response.arrayBuffer();

  // Initialize Tesseract worker
  const worker = await createWorker({
    logger: m => console.log(m),
    workerPath: 'https://unpkg.com/tesseract.js@5.0.5/dist/worker.min.js',
    corePath: 'https://unpkg.com/tesseract.js-core@5.0.5/tesseract-core.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });

  try {
    // Load image
    await worker.loadImage(new Uint8Array(imageArrayBuffer));

    // Perform OCR
    const { data: { text } } = await worker.recognize();

    console.log("OCR process completed");
    return text;
  } finally {
    await worker.terminate();
  }
}


function evaluateMathExpression(input: string): { grade: number; feedback: string } {
  console.log("Evaluating math expressions:", input)

  // Remove extra whitespace
  input = input.replace(/\s+/g, " ").trim()

  if (!input) {
    console.log("Empty input")
    return { grade: 0, feedback: "未能识别到任何内容。" }
  }

  const lines: string[] = input.split(/[,;\n]+/)

  let totalGrade = 0
  let totalExpressions = 0
  const feedbacks: string[] = []

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    try {
      const match: RegExpMatchArray | null = line.match(
        /^(.+?)(=|!=|<=|>=|<|>)(.+)$/
      )

      if (match) {
        const [, leftSide, operator, rightSide] = match
        const leftResult: number = evaluate(leftSide)
        const rightResult: number = evaluate(rightSide)

        let isCorrect = false

        switch (operator) {
          case "=":
            isCorrect = Math.abs(leftResult - rightResult) < 0.0001; break
          case "!=":
            isCorrect = leftResult !== rightResult; break
          case "<":
            isCorrect = leftResult < rightResult; break
          case "<=":
            isCorrect = leftResult <= rightSide; break
          case ">":
            isCorrect = leftResult > rightResult; break
          case ">=":
            isCorrect = leftResult >= rightResult; break
        }

        if (isCorrect) {
          totalGrade += 100
          feedbacks.push(`表达式 "${line}" 正确！`)
        } else {
          feedbacks.push(
            `表达式 "${line}" 不正确。` +
            `左边 = ${leftResult}，右边 = ${rightResult}`
          )
        }
        totalExpressions++
      } else {
        const result: number = evaluate(line)
        feedbacks.push(`表达式 "${line}" 的计算结果是 ${result}。`)
        totalGrade += 50
        totalExpressions++
      }
    } catch (error) {
      console.error("Error evaluating expression:", line, error)

      const numbers: string[] | null = line.match(/[-+]?\d*\.?\d+/g)
      if (numbers && numbers.length > 0) {
        const sum: number = numbers.reduce(
          (acc, num) => acc + parseFloat(num), 0
        )
        feedbacks.push(
          `在 "${line}" 中找到了以下数字：${numbers.join(", ")}。` +
          `这些数字的和是 ${sum}。`
        )
        totalGrade += 25
        totalExpressions++
      } else {
        feedbacks.push(`无法解析 "${line}" 为数学表达式。`)
      }
    }
  }

  const averageGrade: number =
    totalExpressions > 0 ? Math.round(totalGrade / totalExpressions) : 0

  const combinedFeedback: string = feedbacks.join("\n")

  return {
    grade: averageGrade,
    feedback: `总体得分：${averageGrade}\n\n详细反馈：\n${combinedFeedback}`,
  }
}