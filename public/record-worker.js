// 记录处理Worker - 多线程优化
const recordBatchQueue = [];
let batchProcessingTimer = null;
const BATCH_PROCESS_DELAY = 20; // 20毫秒批处理延迟 - 小批量处理
const MAX_BATCH_SIZE = 3; // 最大批处理大小 - 小批量处理

// 处理单个记录
function processRecord(data) {
  const plate = String(data?.plate || "").trim();
  if (!plate) return null;
  
  const id = String(data?.id || "") || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const receivedAt = Number(data?.receivedAt || Date.now()) || Date.now();
  const eventAt = Number(data?.eventAt || 0) || (() => {
    if (data?.timestamp) {
      const t = new Date(data.timestamp).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  })();
  const imageDataUrl =
    typeof data?.image === "string" && data.image
      ? data.image
      : typeof data?.imageUrl === "string" && data.imageUrl
      ? data.imageUrl
      : "";

  return {
    id,
    plate,
    receivedAt,
    eventAt,
    imageDataUrl,
    serialSentAt: Number(data?.serialSentAt || 0) || 0,
    ftpRemotePath: typeof data?.ftpRemotePath === "string" ? data.ftpRemotePath : "",
    parsedMeta: data?.parsedMeta && typeof data.parsedMeta === "object" ? data.parsedMeta : null
  };
}

// 批量处理记录
function processRecordBatch() {
  if (recordBatchQueue.length === 0) {
    batchProcessingTimer = null;
    return;
  }
  
  // 减少日志频率，只在处理较大批量时记录
  const batchSize = Math.min(MAX_BATCH_SIZE, recordBatchQueue.length);
  if (batchSize >= MAX_BATCH_SIZE) {
    console.log(`[Worker] 开始批处理, 批量大小: ${batchSize}, 队列长度: ${recordBatchQueue.length}`);
  }
  
  // 获取一批记录进行处理
  const batch = recordBatchQueue.splice(0, batchSize);
  
  if (batch.length === 0) {
    batchProcessingTimer = null;
    return;
  }
  
  // 处理批量记录
  const processedRecords = [];
  
  for (const data of batch) {
    const record = processRecord(data);
    if (record) {
      processedRecords.push(record);
    }
  }
  
  // 发送处理完成的记录到主线程
  if (processedRecords.length > 0) {
    self.postMessage({
      type: 'records-processed',
      records: processedRecords,
      queueLength: recordBatchQueue.length,
      batchSize: processedRecords.length
    });
  }
  
  // 如果队列中还有记录，继续处理 - 小批量处理模式
  if (recordBatchQueue.length > 0) {
    // 小批量处理：延迟处理下一批记录
    batchProcessingTimer = setTimeout(processRecordBatch, BATCH_PROCESS_DELAY);
  } else {
    batchProcessingTimer = null;
  }
}

// 添加记录到批处理队列 - 小批量处理模式
function addRecordToBatch(data) {
  recordBatchQueue.push(data);
  const plate = String(data?.plate || "").trim();
  
  // 只在队列长度较小时记录，避免过多日志
  if (recordBatchQueue.length <= 3) {
    console.log(`[Worker] 记录到达: ${plate}, 队列长度: ${recordBatchQueue.length}`);
  }
  
  // 监控队列状态
  if (recordBatchQueue.length > 10) {
    console.warn(`[Worker] 批处理队列长度较高: ${recordBatchQueue.length}`);
  }
  
  // 小批量处理策略：延迟处理，收集多条记录后批量处理
  if (!batchProcessingTimer) {
    batchProcessingTimer = setTimeout(processRecordBatch, BATCH_PROCESS_DELAY);
  }
}

// Worker消息处理
self.onmessage = function(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'add-record':
      addRecordToBatch(data);
      break;
      
    case 'get-queue-status':
      self.postMessage({
        type: 'queue-status',
        queueLength: recordBatchQueue.length,
        hasTimer: !!batchProcessingTimer
      });
      break;
      
    case 'clear-queue':
      recordBatchQueue.length = 0;
      if (batchProcessingTimer) {
        clearTimeout(batchProcessingTimer);
        batchProcessingTimer = null;
      }
      self.postMessage({
        type: 'queue-cleared',
        message: '队列已清空'
      });
      break;
      
    case 'ping':
      self.postMessage({
        type: 'pong',
        timestamp: Date.now()
      });
      break;
  }
};

// Worker初始化完成
self.postMessage({
  type: 'worker-ready',
  message: '记录处理Worker已就绪'
});