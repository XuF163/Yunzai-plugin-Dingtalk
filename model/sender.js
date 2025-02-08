// dingSender.js
import https from "https";
import { EventAck } from "dingtalk-stream"; // 只需要 EventAck
import fs from 'node:fs/promises';
import path from "path";
import sharp from 'sharp'; // 用于图片格式转换
import Config from "../lib/config.js";
import  DingTalkImageUploader  from "../model/panupload.js";
// 导出 sendMsg 函数，用于发送文本消息
export async function sendMsg(msg, sessionWebhook) {
  // 接收 sessionWebhook 作为参数
  const webhook = sessionWebhook;


  const responseMessage = {
    msgtype: "markdown",
    markdown: {
      title: "消息外显new",
      text: `${msg}`,
    },
  };

  try {
    console.log("发送消息[消息模块]", responseMessage.markdown.text);
  } catch (error) {
    console.error("处理消息时出错", error);
  }

  const data = JSON.stringify(responseMessage);
  console.log("msg发送预备", responseMessage);
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  const req = https.request(webhook, options, (res) => {
    console.log(`状态码: ${res.statusCode}`);
    res.on("data", (d) => {
      console.log("data:", d);
    });
  });
  req.on("error", (error) => {
    console.error(error);
  });
  req.write(data);
  req.end();
  return { status: EventAck.SUCCESS, message: "OK" };
}




  export async function sendMarkdownImage(data, file, sessionWebhook, summary = '图片') {
    console.log("Debug - File parameter at sendMarkdownImage entry:"); //  !!!  添加日志： 打印进入 sendMarkdownImage 函数时 file 参数的完整结构
  console.dir(file, { depth: null });
  // 优先使用会话 Webhook，否则使用全局配置 webhook
  const webhook = sessionWebhook || config.webhook;
  logger.info('准备发送图片消息', file);

  if (file) {
    console.log("sendMarkdownImage - File parameter type:", typeof file); // 打印 file 参数类型
    console.log("sendMarkdownImage - File object keys:", Object.keys(file)); // 打印 file 对象的 key
  } else {
    console.log("sendMarkdownImage - File parameter is null or undefined.");
  }

  let imageUrl = null; // 初始化 imageUrl
  let imageBuffer = null; // 用于存储实际的 Buffer 数据

  try {
    // 检查 file 是否是 Buffer 对象
    if (Buffer.isBuffer(file)) {
      logger.info('sendMarkdownImage: 检测到 file 参数直接是 Buffer 数据');
      imageBuffer = file; // 如果 file 本身就是 Buffer，直接使用
    } else if (file && Buffer.isBuffer(file.buffer)) {
      logger.info('sendMarkdownImage: 检测到 file.buffer 包含 Buffer 数据');
      imageBuffer = file.buffer; // 如果 file 是对象且 file.buffer 是 Buffer，则使用 file.buffer
    } else {
      const errorMessage = 'sendMarkdownImage: 未检测到有效的图片 Buffer 数据，无法上传图片。';
      console.warn(errorMessage);
      return { status: 'FAILURE', message: errorMessage }; // 如果没有 Buffer 数据，则无法上传图片
    }

    // 确保 imageBuffer 存在有效的 Buffer 数据
    if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
      logger.info('sendMarkdownImage: 准备上传图片 Buffer 数据到钉钉');
      // 使用 dingTalkImageUploader 上传 Buffer 并获取 URL (使用 imageBuffer)
      imageUrl = await DingTalkImageUploader.imageToDingTalkUrl(imageBuffer);

      if (!imageUrl) {
        const errorMessage = 'sendMarkdownImage: 使用 dingTalkImageUploader 上传图片失败，未获取到图片 URL。';
        console.error(errorMessage);
        return { status: 'FAILURE', message: errorMessage };
      }
      logger.info("sendMarkdownImage: 使用 dingTalkImageUploader 获取到图片URL:", imageUrl);

    } else {
      const errorMessage = 'sendMarkdownImage: 未检测到有效的图片 Buffer 数据，无法上传图片。 (imageBuffer 无效)';
      console.warn(errorMessage);
      return { status: 'FAILURE', message: errorMessage }; // 如果 imageBuffer 无效，则无法上传图片
    }


    // 构造 Markdown 消息体，使用 imageUrl 嵌入图片
    const markdownMessage = {
      msgtype: 'markdown',
      markdown: {
        title: summary,
        text: `![${summary}](${imageUrl})\n`
      }
    };

    logger.info("sendMarkdownImage: 发送Markdown图片消息 - 图片URL:", imageUrl);
    logger.debug('sendMarkdownImage: 发送消息[消息模块]', markdownMessage);

    const postData = JSON.stringify(markdownMessage);
    logger.debug('sendMarkdownImage: msg发送预备', markdownMessage);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    // 封装 HTTPS 请求，返回 Promise
    return new Promise((resolve, reject) => {
      const req = https.request(webhook, options, (res) => {
        logger.debug(`sendMarkdownImage: 状态码: ${res.statusCode}`);
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
          logger.debug('sendMarkdownImage: data:', chunk.toString());
        });
        res.on('end', () => {
          try {
            const parsedResponse = JSON.parse(responseData);
            logger.debug('sendMarkdownImage: 响应数据解析:', parsedResponse);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: EventAck.SUCCESS, message: 'OK', response: parsedResponse });
            } else {
              const error = new Error(`HTTP 请求失败，状态码: ${res.statusCode}, 响应数据: ${responseData}`);
              logger.error('sendMarkdownImage: 钉钉API请求失败', error);
              reject({ status: EventAck.FAILURE, message: '钉钉API请求失败', error: error });
            }
          } catch (parseError) {
            logger.error('sendMarkdownImage: JSON 解析错误', parseError, responseData);
            reject({ status: EventAck.FAILURE, message: 'JSON 解析错误', error: parseError });
          }
        });
      });

      req.on('error', (error) => {
        logger.error('sendMarkdownImage: HTTPS 请求错误', error);
        reject({ status: 'EventAck.FAILURE', message: 'HTTPS 请求错误', error: error });
      });

      req.write(postData);
      req.end();
    });
  }
  catch (error) { // 推荐
    console.error('sendMarkdownImage: Error processing image in sendMarkdownImage:', error);
    return { status: 'FAILURE', message: 'Error processing image', error: error.message };
  }
}






