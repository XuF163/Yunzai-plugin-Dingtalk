// dingSender.js
import https from "https";
import { EventAck } from "dingtalk-stream"; // 只需要 EventAck
import fs from 'node:fs/promises';
import path from "path";
import sharp from 'sharp'; // 用于图片格式转换

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

// 导出 sendImg 函数，用于发送图片消息
export async function sendImg(url, sessionWebhook) {
  // 接收 sessionWebhook 作为参数
  const webhook = sessionWebhook || config.webhook; // 优先使用传入的 sessionWebhook，否则使用 config.webhook
  console.log("准备发送图片消息", url);
  const responseMessage = {
    msgtype: "markdown",
    markdown: {
      title: "我是图片",
      text: `![screenshot](${url})\n`,
    },
  };

  try {
    console.log("发送消息[消息模块]", responseMessage);
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
  return {status: EventAck.SUCCESS, message: "OK"};
}

  /**
 * 发送 Markdown 图片消息 (简化版，不再依赖适配器实例)
 * @param {object} data 消息事件数据 (仍然接收 data 参数，但不再使用 data.self_id 获取适配器实例)
 * @param {string|Buffer} file 图片文件路径或 Buffer
 * @param {string} sessionWebhook 会话 Webhook (如果存在)
 * @param {string} [summary='图片'] 图片摘要 (Markdown 标题)
 * @returns {Promise<{status: string, message: string, error?: any}>} 发送结果
 */


  export async function sendMarkdownImage(data, file, sessionWebhook, summary = '图片') {
  // 优先使用会话 Webhook，否则使用全局配置 webhook
  const webhook = sessionWebhook || config.webhook;
  logger.info('准备发送图片消息', file);

  // --- [Start] 将图片 buffer 转为 PNG 并保存到本地 ---
  if (file && Buffer.isBuffer(file.file)) {
    try {
      // 使用 sharp 将输入 buffer 转为 PNG 格式
      const pngBuffer = await sharp(file.file).png().toBuffer();

      // 构造保存图片的本地路径（确保目录存在）
      const debugImagePath = path.join('./temp/debug-images', `${Date.now()}-${summary}.png`);
      await fs.mkdir(path.dirname(debugImagePath), { recursive: true });
      await fs.writeFile(debugImagePath, pngBuffer);
      logger.info(`[Debug] Buffer saved to local file: ${debugImagePath}`);

      // 更新 file 对象，方便后续通过 Bot.fileToUrl 获取图片 URL（例如使用 file.path 属性）
      file.file = pngBuffer;
      file.path = debugImagePath;
    } catch (err) {
      logger.error("Error converting image buffer to PNG and saving locally", err);
    }
  } else {
    logger.warn("[Debug] file.file is not a Buffer, cannot save to local file.");
  }
  // --- [End] 将图片 buffer 转为 PNG 并保存到本地 ---

  console.log("File parameter type:", typeof file);
  console.log("File parameter instanceof Buffer:", file instanceof Buffer);

  try {
    // 直接调用 Bot.fileToUrl 获取图片 URL（内部可根据 file.path 等属性生成 URL）
    const imageUrl = await Bot.fileToUrl(file);

    if (!imageUrl) {
      const errorMessage = 'Failed to generate image URL using Bot.fileToUrl.';
      console.error(errorMessage);
      return { status: 'FAILURE', message: errorMessage };
    }

    // 构造 Markdown 消息体，使用 imageUrl 嵌入图片
    const markdownMessage = {
      msgtype: 'markdown',
      markdown: {
        title: summary,
        text: `![${summary}](${imageUrl})\n`
      }
    };

    logger.info("发送Markdown图片消息 - 图片URL:", imageUrl);
    logger.debug('发送消息[消息模块]', markdownMessage);

    const postData = JSON.stringify(markdownMessage);
    logger.debug('msg发送预备', markdownMessage);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    // 封装 HTTPS 请求，返回 Promise
    return new Promise((resolve, reject) => {
      const req = https.request(webhook, options, (res) => {
        logger.debug(`状态码: ${res.statusCode}`);
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
          logger.debug('data:', chunk.toString());
        });
        res.on('end', () => {
          try {
            const parsedResponse = JSON.parse(responseData);
            logger.debug('响应数据解析:', parsedResponse);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: EventAck.SUCCESS, message: 'OK', response: parsedResponse });
            } else {
              const error = new Error(`HTTP 请求失败，状态码: ${res.statusCode}, 响应数据: ${responseData}`);
              logger.error('钉钉API请求失败', error);
              reject({ status: EventAck.FAILURE, message: '钉钉API请求失败', error: error });
            }
          } catch (parseError) {
            logger.error('JSON 解析错误', parseError, responseData);
            reject({ status: EventAck.FAILURE, message: 'JSON 解析错误', error: parseError });
          }
        });
      });

      req.on('error', (error) => {
        logger.error('HTTPS 请求错误', error);
        reject({ status: EventAck.FAILURE, message: 'HTTPS 请求错误', error: error });
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('Error processing image in sendMarkdownImage:', error);
    return { status: 'FAILURE', message: 'Error processing image', error: error.message };
  }
}




