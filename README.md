# Claude Code

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@anthropic-ai/claude-code) [![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?style=flat-square)](https://github.com/suguangnet/claude-code-source)

[npm]: https://img.shields.io/npm/v/@anthropic-ai/claude-code.svg?style=flat-square

## 项目简介

Claude Code 是一个智能编码工具，它运行在您的终端中，理解您的代码库，并通过执行常规任务、解释复杂代码和处理 git 工作流程来帮助您更快地编码 —— 所有这些都通过自然语言命令完成。

您可以在终端、IDE 中使用它，或在 Github 上标记 @claude。

**在 [Claude Code 主页](https://claude.com/product/claude-code) 了解更多** | [文档](https://code.claude.com/docs/en/overview) | [GitHub 仓库](https://github.com/suguangnet/claude-code-source)

<img src="https://github.com/anthropics/claude-code/blob/main/demo.gif?raw=1" />

## 开始使用

### 全局安装

1. 安装 Claude Code：
   ```sh
   npm install -g @anthropic-ai/claude-code
   ```

2. 导航到您的项目目录并运行：
   ```sh
   claude
   ```

### 本地运行（源码方式）

1. 克隆或下载本仓库到本地
2. 安装依赖：
   ```sh
   npm install
   ```
3. 运行 Claude Code：
   ```sh
   bun run cli.js
   # 或
   node cli.js
   ```

## 功能特性

- **代码编写与修改**：创建新文件、编辑现有代码
- **代码搜索与分析**：在项目中查找文件、搜索关键词、理解代码结构
- **调试与问题排查**：分析错误、定位 bug、提供修复方案
- **运行命令**：执行 shell 命令、运行测试、构建项目
- **Git 操作**：查看状态、创建提交、管理分支、创建 PR
- **Web 搜索**：获取最新的技术文档和信息
- **项目规划**：为复杂任务制定实施方案

## 报告错误

我们欢迎您的反馈。您可以：
- 使用 `/bug` 命令在 Claude Code 中直接报告问题
- 提交 [GitHub issue](https://github.com/anthropics/claude-code/issues)

## 加入社区

加入 [Claude 开发者 Discord](https://anthropic.com/discord)，与其他使用 Claude Code 的开发者联系：
- 获取帮助和支持
- 分享反馈和建议
- 与社区讨论您的项目

## 数据收集与隐私

### 数据收集
当您使用 Claude Code 时，我们会收集以下数据：
- 使用数据（如代码接受或拒绝）
- 相关的对话数据
- 通过 `/bug` 命令提交的用户反馈

### 数据使用
请参阅我们的 [数据使用政策](https://code.claude.com/docs/en/data-usage)。

### 隐私保护
我们已实施多项保护措施来保护您的数据，包括：
- 对敏感信息的有限保留期
- 对用户会话数据的受限访问

有关完整详情，请查看我们的 [商业服务条款](https://www.anthropic.com/legal/commercial-terms) 和 [隐私政策](https://www.anthropic.com/legal/privacy)。

## 源代码反编译

如果您有 `cli.js` 和 `cli.js.map` 文件，您可以使用以下步骤反编译源代码：

### 前提条件
- Node.js 18+（推荐：v18.20.8）
- npm（包含在 Node.js 中）

### 反编译步骤

1. **安装依赖**：
   ```sh
   # 安装 source-map 库
   npm install source-map
   ```

2. **创建反编译脚本**（`parse-sourcemap.js`）：
   ```javascript
   const fs = require('fs');
   const path = require('path');
   const { SourceMapConsumer } = require('source-map');

   // 读取 source map 文件
   const sourceMapContent = fs.readFileSync('./cli.js.map', 'utf8');
   const sourceMap = JSON.parse(sourceMapContent);

   console.log('Source Map version:', sourceMap.version);
   console.log('Source Root:', sourceMap.sourceRoot);
   
   // 创建项目源文件输出目录
   const outputDir = './project-source';
   if (!fs.existsSync(outputDir)) {
     fs.mkdirSync(outputDir, { recursive: true });
   }

   // 筛选并导出项目源文件（排除 node_modules）
   let projectFileCount = 0;
   if (sourceMap.sourcesContent && sourceMap.sources) {
     sourceMap.sources.forEach((sourcePath, index) => {
       // 跳过 node_modules 和 lodash 文件
       if (!sourcePath.includes('node_modules') && !sourcePath.includes('lodash')) {
         const content = sourceMap.sourcesContent[index];
         if (content) {
           // 创建文件路径
           const fileName = path.basename(sourcePath);
           const outputPath = path.join(outputDir, fileName);
           
           // 写入文件
           fs.writeFileSync(outputPath, content);
           projectFileCount++;
         }
       }
     });
   }

   console.log(`成功导出 ${projectFileCount} 个项目源文件到 ${outputDir}`);
   console.log('反编译完成。');
   ```

3. **运行反编译脚本**：
   ```sh
   node parse-sourcemap.js
   ```

4. **反编译结果**：
   - 成功从 `cli.js.map` 文件中提取并导出了 1901 个项目核心代码文件
   - 这些文件已经保存在 `./project-source` 目录中

5. **访问反编译后的源代码**：
   反编译后的源代码将在 `project-source` 目录中可用。

## 编译方法

要从反编译的源代码重新编译项目，请按照以下步骤操作：

### 前提条件
- Node.js 18+（推荐：v18.20.8）
- Bun（推荐用于构建过程，v1.3.11 或更高版本）

### 安装 Bun

```sh
# 在 macOS、Linux 和 WSL 上
curl -fsSL https://bun.sh/install | bash

# 在 Windows 上（使用 PowerShell）
iwr https://bun.sh/install.ps1 -useb | iex
```

### 编译步骤

1. **安装项目依赖**：
   ```sh
   bun install
   ```

2. **构建项目**：
   ```sh
   bun run build
   ```

3. **验证构建**：
   构建成功后，您应该在项目根目录中看到 `cli.js` 和 `cli.js.map` 文件。

### 构建配置

此存储库中的 `package.json` 文件非常简单，仅包含用于反编译的 `source-map` 依赖。原始构建配置未包含在内。

### 自定义构建设置

要为反编译的源代码设置构建过程，您可以创建一个更全面的 `package.json` 文件，其中包含构建脚本。以下是一个示例：

```json
{
  "name": "claude-code",
  "version": "1.0.0",
  "description": "Claude Code - 智能编码工具",
  "main": "cli.js",
  "scripts": {
    "build": "bun build src/cli.tsx --outfile cli.js --sourcemap",
    "dev": "bun run src/cli.tsx"
  },
  "dependencies": {
    "source-map": "^0.7.6"
  },
  "devDependencies": {
    "bun-types": "latest"
  }
}
```

根据您的项目结构和构建要求调整构建脚本。

## 运行说明

### 关于编译产物

**重要说明：** 这个项目编译出来的不是 `.exe` 文件，而是 JavaScript 脚本文件。这是因为：

- **JavaScript 是解释型语言**：需要通过 Node.js 或 Bun 等运行时来执行
- **跨平台兼容性**：JavaScript 脚本可以在 Windows、macOS、Linux 等不同系统上运行
- **模块化设计**：便于更新和维护

### 运行方式

#### 1. 通过全局安装运行（推荐）

```sh
# 查看版本
claude --version

# 非交互式模式
claude -p "你的问题"

# 交互式模式
claude
```

#### 2. 通过源码运行

```sh
# 使用 Bun 运行
cd C:\Users\Administrator\Desktop\claude-code-source
bun run cli.js --version
bun run cli.js -p "你的问题"

# 或使用 Node.js 运行
cd C:\Users\Administrator\Desktop\claude-code-source
node cli.js --version
node cli.js -p "你的问题"
```

### 注意事项

- **Node.js 版本**：推荐使用 Node.js v18.20.8
- **Bun 版本**：推荐使用 Bun v1.3.11 或更高版本
- **依赖安装**：运行前请确保已安装所有必要的依赖

### 关于 .exe 文件

如果您需要创建一个 `.exe` 文件，可以考虑使用工具如 **pkg** 或 **nexe** 来将 Node.js 应用打包成可执行文件。

## 常见问题

### Q: 为什么编译出来的不是 .exe 文件？
A: 因为 Claude Code 是基于 JavaScript 开发的，需要通过 Node.js 或 Bun 运行时来执行，这样可以保证跨平台兼容性。

### Q: 我可以在哪些平台上运行 Claude Code？
A: 您可以在 Windows、macOS、Linux 等任何安装了 Node.js 或 Bun 的平台上运行 Claude Code。

### Q: 推荐使用哪个运行时？
A: 推荐使用 Bun 运行时，因为它提供了更好的性能和构建体验。

### Q: 如何更新 Claude Code？
A: 如果是全局安装的版本，可以使用 `npm update -g @anthropic-ai/claude-code` 来更新。如果是源码版本，可以重新克隆或拉取最新代码并重新构建。