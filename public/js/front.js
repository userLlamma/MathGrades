import { functions, storage, auth, ref, uploadBytes, getDownloadURL, httpsCallable, createUserWithEmailAndPassword, signInWithEmailAndPassword  } from './firebase-config.js';



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

// 登录功能
loginButton.addEventListener('click', () => {
    const email = loginEmail.value;
    const password = loginPassword.value;
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            console.log('Login successful');
            showHomeworkSection();
        })
        .catch((error) => {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
        });
});

// 注册功能
registerButton.addEventListener('click', () => {
    const email = registerEmail.value;
    const password = registerPassword.value;

    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            console.log('Registration successful');
            showHomeworkSection();
        })
        .catch((error) => {
            console.error('Registration error:', error);
            alert('Registration failed: ' + error.message);
        });
});

// 登出功能
logoutButton.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            console.log('Logout successful');
            showLoginRegisterSections();
        })
        .catch((error) => {
            console.error('Logout error:', error);
        });
});


// 监听认证状态变化
auth.onAuthStateChanged((user) => {
    if (user) {
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


uploadButton.addEventListener('click', async () => {
    const file = imageUpload.files[0];
    if (!file) {
        alert('Please select an image first.');
        return;
    }

    try {
        // 创建一个唯一的文件名
        const fileName = `homework_${new Date().getTime()}_${file.name}`;
        console.log('fileName='+fileName);
        const storageRef = ref(storage, 'homework/' + fileName);

        // 上传文件到 Firebase Storage
        console.log('before uploadBytes');
        const snapshot = await uploadBytes(storageRef, file);
        console.log('Uploaded a file!');

        // 获取下载 URL
        const imageUrl = await getDownloadURL(snapshot.ref);
        console.log('File available at', imageUrl);

        // 使用上传后的图片URL调用作业评分API
        const gradeHomework = httpsCallable(functions, 'gradeHomework');
        const gradeResult = await gradeHomework({ 
            imageUrl, 
            useClaudeApi: useClaudeApiCheckbox.checked // 添加这个选项
        });
        console.log('Grading result:', gradeResult.data);


        // Display result
        resultDiv.innerHTML = `
            <h2>Grade: ${gradeResult.data.grade}</h2>
            <p>Feedback: ${gradeResult.data.feedback}</p>
        `;
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }
});