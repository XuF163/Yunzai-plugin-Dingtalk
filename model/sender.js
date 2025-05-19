// sender.js
import https from "https";
import { EventAck } from "dingtalk-stream";
import RootConfig from "../lib/config.js"; // 使用 RootConfig 来访问账户列表或全局配置
import DingTalkImageUploader from "../model/panupload.js";

const logger = global.logger || Bot.logger || { info: console.log, error: console.error, debug: console.log, warn: console.warn };

// 辅助函数，从 RootConfig.dingdingAccounts 中获取指定accountId的配置
function getAccountConfigFromSelfId(self_id_in_event) {
    if (!self_id_in_event || !Array.isArray(RootConfig.dingdingAccounts)) {
        return RootConfig; // Fallback to global config or handle error
    }
    let accountId = null;
    if (typeof self_id_in_event === 'string' && self_id_in_event.startsWith(`DingDing_`)) {
        accountId = self_id_in_event.substring("DingDing_".length);
    } else { // Attempt to find by clientId if self_id_in_event is a clientId
        const foundByClientId = RootConfig.dingdingAccounts.find(acc => acc.clientId === self_id_in_event);
        if (foundByClientId) accountId = foundByClientId.accountId;
    }

    if (!accountId) return RootConfig; // Fallback

    const account = RootConfig.dingdingAccounts.find(acc => acc.accountId === accountId);
    return account || RootConfig; // Fallback to global if specific account not found by parsed accountId
}


export async function sendMsg(msg, sessionWebhook, eventContext) { // eventContext 是原始事件 e
  let webhook = sessionWebhook;
  const accountConfig = eventContext ? getAccountConfigFromSelfId(eventContext.self_id) : RootConfig;

  if (!webhook && accountConfig && accountConfig.webhook) {
      webhook = accountConfig.webhook; // 使用特定账户的默认 webhook 作为回退
  }
  if (!webhook && RootConfig.defaultWebhook) { // 再回退到全局默认
      webhook = RootConfig.defaultWebhook;
  }

  if (!webhook) {
    logger.error(`[sendMsg] (Bot: ${eventContext?.self_id}) Webhook is undefined (session, account, or global). Cannot send message.`);
    return Promise.reject({ status: EventAck.FAILURE, message: "Webhook not provided" });
  }

  const responseMessage = {
    msgtype: "markdown",
    markdown: {
      title: msg.substring(0,15) || "消息",
      text: `${msg}`,
    },
  };

  logger.info(`[sendMsg] (Bot: ${eventContext?.self_id}) Preparing to send Markdown to webhook: ${webhook.substring(0, webhook.indexOf('?')) || webhook}... Text: ${responseMessage.markdown.text.substring(0,50)}...`);
  const postData = JSON.stringify(responseMessage);

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(webhook, options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => responseBody += chunk);
      res.on("end", () => {
        logger.debug(`[sendMsg] (Bot: ${eventContext?.self_id}) HTTP Status: ${res.statusCode}. Raw Response: ${responseBody.substring(0,200)}`);
        try {
          const parsedResponse = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsedResponse.errcode === 0) {
            logger.info(`[sendMsg] (Bot: ${eventContext?.self_id}) Message sent successfully via Markdown.`);
            resolve({ status: EventAck.SUCCESS, message: "OK", response: parsedResponse });
          } else {
            const errMsg = parsedResponse.errmsg || `HTTP Error ${res.statusCode}`;
            logger.error(`[sendMsg] (Bot: ${eventContext?.self_id}) DingTalk API Error: ${errMsg}. Full Response:`, parsedResponse);
            reject({ status: EventAck.FAILURE, message: `DingTalk API Error: ${errMsg}`, response: parsedResponse, error: new Error(errMsg) });
          }
        } catch (e) {
          logger.error(`[sendMsg] (Bot: ${eventContext?.self_id}) Failed to parse JSON response from DingTalk.`, e, "Raw Body:", responseBody);
          reject({ status: EventAck.FAILURE, message: "Failed to parse DingTalk JSON response", error: e, rawResponse: responseBody });
        }
      });
    });
    req.on("error", (error) => {
      logger.error(`[sendMsg] (Bot: ${eventContext?.self_id}) HTTPS Request Error:`, error);
      reject({ status: EventAck.FAILURE, message: "HTTPS Request Error", error });
    });
    req.write(postData);
    req.end();
  });
}

// dataForLogContext 是原始事件 e，包含了 e.self_id
export async function sendMarkdownImage(dataForLogContext, fileInfoFromAdapter, sessionWebhook, summary = '图片') {
  let webhook = sessionWebhook;
  const accountConfig = dataForLogContext ? getAccountConfigFromSelfId(dataForLogContext.self_id) : RootConfig;

  if (!webhook && accountConfig && accountConfig.webhook) {
      webhook = accountConfig.webhook;
  }
  if (!webhook && RootConfig.defaultWebhook) { // 使用全局RootConfig访问
      webhook = RootConfig.defaultWebhook;
  }

  if (!webhook) {
    logger.error(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Webhook is undefined. Cannot send image.`);
    return { status: EventAck.FAILURE, message: "Webhook not provided for image sending" };
  }

  logger.info(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Preparing image. fileInfo name:`, fileInfoFromAdapter?.name);

  let imageUrlWithParentheses;
  try {
    // 将 dataForLogContext 传递给 imageToDingTalkUrl 以便 panupload 内部获取 accountId
    imageUrlWithParentheses = await DingTalkImageUploader.imageToDingTalkUrl(dataForLogContext, fileInfoFromAdapter);

    if (!imageUrlWithParentheses || typeof imageUrlWithParentheses !== 'string' || !imageUrlWithParentheses.startsWith('(') || !imageUrlWithParentheses.endsWith(')')) {
      const errorMessage = `[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Failed to get valid markdown image URL. Received: ${imageUrlWithParentheses}`;
      logger.error(errorMessage);
      return { status: EventAck.FAILURE, message: errorMessage };
    }
    logger.info(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Obtained markdown image URL:`, imageUrlWithParentheses);

  } catch (error) {
    logger.error(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Error obtaining image URL from Uploader:`, error);
    return { status: EventAck.FAILURE, message: `Error preparing image URL: ${error.message || error.toString()}` };
  }

  const markdownMessage = {
    msgtype: 'markdown',
    markdown: {
      title: summary,
      text: `![${summary}]${imageUrlWithParentheses}\n`
    }
  };

  logger.info(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Sending Markdown with image to ${webhook.substring(0,webhook.indexOf("?")) || webhook}. URL part:`, imageUrlWithParentheses);

  const postData = JSON.stringify(markdownMessage);
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(webhook, options, (res) => {
      logger.debug(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) HTTP Status: ${res.statusCode}`);
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        logger.debug(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Raw HTTP Response: ${responseData.substring(0,200)}`);
        try {
          const parsedResponse = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsedResponse.errcode === 0) {
            logger.info(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Markdown image sent successfully.`);
            resolve({ status: EventAck.SUCCESS, message: 'OK', response: parsedResponse });
          } else {
            const errMsg = parsedResponse.errmsg || `HTTP status ${res.statusCode}`;
            logger.error(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) DingTalk API error: ${errMsg}. Full response:`, parsedResponse);
            reject({ status: EventAck.FAILURE, message: `DingTalk API error: ${errMsg}`, response: parsedResponse, error: new Error(errMsg) });
          }
        } catch (parseError) {
          logger.error(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) Failed to parse JSON response from DingTalk.`, parseError, 'Raw data:', responseData);
          reject({ status: EventAck.FAILURE, message: 'JSON parse error from DingTalk response.', error: parseError, rawResponse: responseData });
        }
      });
    });
    req.on('error', (error) => {
      logger.error(`[sendMarkdownImage] (Bot: ${dataForLogContext?.self_id}) HTTPS request failed.`, error);
      reject({ status: EventAck.FAILURE, message: 'HTTPS request failed.', error: error });
    });
    req.write(postData);
    req.end();
  });
}