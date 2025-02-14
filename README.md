## Yunzai-plugin-Dingtalk 
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2FXuF163%2FYunzai-plugin-Dingtalk&count_bg=%23412DDC&title_bg=%23595454&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=true)](https://hits.seeyoufarm.com)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)]()

## 适用于 TrssYunzai的钉钉机器人适配器

还在为QQBot日货不够无法MarkDown而烦恼吗  
加入DingTalk  
MARKDOWN权限点击就送！(bushi) 
### 使用本仓库地址
```
git clone --depth=1 https://github.com/XuF163/Yunzai-plugin-Dingtalk.git ./plugins/Ding-plugin  
```  
 
### 国服  

```
git clone --depth=1 https://ghcdn.042999.xyz/https://github.com/XuF163/Yunzai-plugin-Dingtalk.git ./plugins/Ding-plugin
```
### 依赖

```
cd plugins/Ding-plugin && pnpm i
```
### 配置  
  参阅[钉钉开发者后台](open-dev.dingtalk.com/) ,选择stream格式；webhook模式暂不适配

### 效果演示  

| 私聊                                                                                                  | 群聊                                                                                                  |
|-----------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| <img src="https://img.kookapp.cn/assets/2025-02/08/F4gVXkerVd0u01uo.jpg" width="800" height="1080"> | <img src="https://img.kookapp.cn/assets/2025-02/08/eHBwyQcHBT0u01uo.jpg" width="800" height="1080"> |

TODO 
- [x] 文本收发
- [ ] 自定义Markdown
- [x] 图片(如果没有其它具备图片上传能力的机器人存在则需要使用公网环境)
- [ ] 音频
- [ ] 主动消息  

### 免责声明
本插件仅供学习交流使用，转载请注明来源。  
本仓库存在不代表作者认可上下游仓库的任何行为及价值观。  
因使用本插件导致的任何问题（包括但不限于收益、损失等），作者概不负责。