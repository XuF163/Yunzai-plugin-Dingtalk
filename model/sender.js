// dingSender.js
import https from "https";
import { EventAck } from "dingtalk-stream"; // 只需要 EventAck
import fs from "fs";

// 导出 sendMsg 函数，用于发送文本消息
export async function sendMsg(msg, sessionWebhook) {
  // 接收 sessionWebhook 作为参数
  const webhook = sessionWebhook;

  console.log("准备发送文本消息", msg);
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
  return { status: EventAck.SUCCESS, message: "OK" };
}
