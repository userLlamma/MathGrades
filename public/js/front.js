// 假设你的 Lambda 函数通过 API Gateway 暴露，URL 类似于：
const LAMBDA_API_URL = 'https://f7ouk5lep52mbgp763v43gvpzq0vpgng.lambda-url.us-east-1.on.aws';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase_url='https://ugypcazwqbdkqzuyqvju.supabase.co';
const supabase_anon_key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVneXBjYXp3cWJka3F6dXlxdmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQyMjcyNjksImV4cCI6MjAzOTgwMzI2OX0.DwwfbfKYtfnulfMpWoNeEr0XsXONhbhAyqxhCy73sPw';
const supabase = createClient(
    supabase_url,
    supabase_anon_key
);



// 获取DOM元素
const loginSection = document.getElementById('loginSection');
const registerSection = document.getElementById('registerSection');
const homeworkSection = document.getElementById('homeworkSection');
const logoutButton = document.getElementById('logoutButton');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');

const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerButton = document.getElementById('registerButton');

const imageUpload = document.getElementById('imageUpload');
const uploadButton = document.getElementById('uploadButton');
const resultDiv = document.getElementById('result');
const useClaudeApiCheckbox = document.getElementById('useClaudeApi');

// Login functionality
loginButton.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    })

    if (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    } else {
        console.log('Login successful');
        showHomeworkSection();
    }
});

// Registration functionality
registerButton.addEventListener('click', async () => {
    const email = registerEmail.value;
    const password = registerPassword.value;

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    })

    if (error) {
        console.error('Registration error:', error);
        alert('Registration failed: ' + error.message);
    } else {
        console.log('Registration successful');
        showHomeworkSection();
    }
});

// Logout functionality
logoutButton.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
        console.error('Logout error:', error);
    } else {
        console.log('Logout successful');
        showLoginRegisterSections();
    }
});

// Listen for authentication state changes
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showHomeworkSection();
    } else {
        showLoginRegisterSections();
    }
});

// 显示作业上传部分和登出按钮
function showHomeworkSection() {
    loginSection.style.display = 'none';
    registerSection.style.display = 'none';
    homeworkSection.style.display = 'block';
    logoutButton.style.display = 'block';
}

// 显示登录和注册部分
function showLoginRegisterSections() {
    loginSection.style.display = 'block';
    registerSection.style.display = 'block';
    homeworkSection.style.display = 'none';
    logoutButton.style.display = 'none';
}


// 函数来调用 Lambda
async function callLambdaFunction(imageUrl, useClaudeApi) {
    try {
      const response = await fetch(LAMBDA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 如果需要认证，可能还需要添加 Authorization 头
          'Authorization': 'Bearer your-token-here'
        },
        body: JSON.stringify({
          imageUrl,
          useClaudeApi
        })
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const gradeResult = await response.json();
      return gradeResult;
    } catch (error) {
      console.error("Error calling Lambda function:", error);
      throw error;
    }
}
  
uploadButton.addEventListener('click', async () => {
    const file = imageUpload.files[0];
    if (!file) {
        alert('Please select an image first.');
        return;
    }

    try {
        // 创建一个唯一的文件名
        const fileName = `homework_${new Date().getTime()}_${file.name}`;
        console.log('fileName=' + fileName);

        // 上传文件到 Supabase Storage
        const { data, error } = await supabase.storage
            .from('homework')
            .upload(fileName, file);

        if (error) throw error;

        console.log('Uploaded a file!');

        // 获取下载 URL
        const { data: { publicUrl: imageUrl } } = supabase.storage
            .from('homework')
            .getPublicUrl(fileName);

        console.log('File available at', imageUrl);

        // 使用上传后的图片URL调用作业评分
        // 调用 Lambda 函数
        const gradeResult = await callLambdaFunction(imageUrl, useClaudeApiCheckbox.checked);

        console.log('Grading result:', gradeResult);

        // 清空之前的结果
        resultDiv.innerHTML = '';

        // 添加评分和反馈
        const gradeHeader = document.createElement('h2');
        gradeHeader.textContent = `Grade: ${gradeResult.grade}`;
        resultDiv.appendChild(gradeHeader);

        const feedbackParagraph = document.createElement('p');
        feedbackParagraph.textContent = `Feedback: ${gradeResult.feedback}`;
        resultDiv.appendChild(feedbackParagraph);

        // 创建并添加OCR结果的下载链接
        console.log("gradeResult.ocrResult=" + gradeResult.ocrResult);
        if (gradeResult.ocrResult) {
            const blob = new Blob([gradeResult.ocrResult], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'ocr_result.txt';
            downloadLink.textContent = 'Download OCR Result';

            resultDiv.appendChild(document.createElement('br'));
            resultDiv.appendChild(downloadLink);

            // 清理 URL 对象
            downloadLink.onclick = () => {
                setTimeout(() => URL.revokeObjectURL(url), 100);
            };
        }
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }
});