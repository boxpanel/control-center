// 记录处理Worker - 多线程优化
const recordBatchQueue = [];
let batchProcessingTimer = null;
const BATCH_PROCESS_DELAY = 0; // 0毫秒批处理延迟 - 逐条处理
const MAX_BATCH_SIZE = 1; // 最大批处理大小 - 逐条处理

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
  
  console.log(`[Worker] 开始批处理, 当前队列长度: ${recordBatchQueue.length}, 时间戳: ${Date.now()}`);
  
  // 获取一批记录进行处理
  const batch = recordBatchQueue.splice(0, Math.min(MAX_BATCH_SIZE, recordBatchQueue.length));
  
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
      queueLength: recordBatchQueue.length
    });
  }
  
  // 如果队列中还有记录，继续处理 - 逐条处理模式
  if (recordBatchQueue.length > 0) {
    // 逐条处理：立即处理下一条记录
    batchProcessingTimer = setTimeout(processRecordBatch, 0);
  } else {
    batchProcessingTimer = null;
  }
}

// 添加记录到批处理队列 - 逐条处理模式
function addRecordToBatch(data) {
  recordBatchQueue.push(data);
  const plate = String(data?.plate || "").trim();
  console.log(`[Worker] 记录到达: ${plate}, 时间戳: ${Date.now()}, 队列长度: ${recordBatchQueue.length}`);
  
  // 监控队列状态
  if (recordBatchQueue.length > 5) {
    console.log(`[Worker] 批处理队列长度: ${recordBatchQueue.length}`);
  }
  
  // 逐条处理策略：立即处理
  if (!batchProcessingTimer) {
    batchProcessingTimer = setTimeout(processRecordBatch, 0);
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