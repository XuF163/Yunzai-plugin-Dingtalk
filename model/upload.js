import COS from "cos-nodejs-sdk-v5";
import fs from "fs";
import path from "path";
import Config from "../lib/config.js";
// 初始化 COS 实例
const cos = new COS({
  SecretId: Config.SecretId, // 替换为你的 SecretId
  SecretKey: Config.SecretKey, // 替换为你的 SecretKey
});

/**
 * 上传文件并返回有效期为 ?分钟的 URL
 * @param {string} filePath - 本地文件路径
 * @param {string} bucket - 存储桶名称，格式为 BucketName-APPID
 * @param {string} region - 存储桶地域
 * @param {string} key - 对象键（文件在存储桶中的路径）
 * @returns {Promise<string>} - 返回文件的临时 URL
 */
async function uploadFileAndGetUrl(filePath, bucket, region, key) {
  try {
    // 1. 上传文件到 COS
    await cos.putObject({
      Bucket: Config.Bucket,
      Region: Config.Region,
      Key: Config.Key,
      Body: fs.createReadStream(filePath), // 读取本地文件流
    });

    // 2. 获取文件的临时 URL，有效期为 1 分钟
    const url = cos.getObjectUrl({
      Bucket: Config.Bucket,
      Region: Config.Region,
      Key: key,
      Sign: true, // 生成带签名的 URL
      Expires: 60,
    });

    return url;
  } catch (error) {
    throw new Error(`Failed to upload file and get URL: ${error.message}`);
  }
}
async function fileUpload(filePath) {
  try {
    const fileName = path.basename(filePath);
    const bucket = Config.Bucket; // 存储桶名称，格式为 BucketName-APPID
    const region = Config.Region; // 存储桶地域
    const key = `Config.Key`; // 文件在存储桶中的路径

    const url = await uploadFileAndGetUrl(filePath, bucket, region, key);
    console.log("抽卡记录文件地址:", url);
    logDelete(fileName);
    return url;
  } catch (error) {
    console.error("Error:", error.message);
    throw error; // 抛出错误以便调用方处理
  }
}

function logDelete(name) {
  //五分钟计时
  setTimeout(() => {
    try {
      cos.deleteObject(
        {
          Bucket: "gclog-1321866533", // 填入您自己的存储桶，必须字段
          Region: "ap-guangzhou", // 存储桶所在地域，例如ap-beijing，必须字
          Key: `uploads/${name}`, // 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
        },
        function (err, data) {
          console.log(err || data);
        },
      );
      console.log(`已删除文件${name}`);
    } catch (error) {
      console.error("Error:", error.message);
    }
  }, 60000);
}
export default fileUpload;
