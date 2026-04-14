import pandas as pd
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer
)
from sklearn.model_selection import train_test_split
import numpy as np
from pathlib import Path


DATASET_DIR = Path("./dataset")
PRIMARY_DATASET_PATH = DATASET_DIR / "Tiwalachain-finetune-dataset.csv"
SUPPLEMENTAL_DATASET_PATH = DATASET_DIR / "contract-fairness-supplemental.csv"
tokenizer = None


def load_training_dataframe() -> pd.DataFrame:
    primary_df = pd.read_csv(
        PRIMARY_DATASET_PATH,
        on_bad_lines="skip",
    )

    supplemental_frames = []
    if SUPPLEMENTAL_DATASET_PATH.exists():
        supplemental_frames.append(pd.read_csv(SUPPLEMENTAL_DATASET_PATH))

    frames = [primary_df, *supplemental_frames]
    df = pd.concat(frames, ignore_index=True)
    df = df.rename(columns={"clause": "text"})

    # Keep only valid binary labels and non-empty text. The base CSV contains
    # a handful of malformed comma-split rows, so we filter them out here
    # instead of silently training on corrupted labels.
    df["text"] = df["text"].astype(str).str.strip()
    df["label"] = df["label"].astype(str).str.strip()
    df = df[df["label"].isin({"0", "1"})]
    df = df[df["text"].str.len() > 0]
    df["label"] = df["label"].astype(int)
    return df.reset_index(drop=True)


def tokenize(batch):
    return tokenizer(batch["text"], padding=True, truncation=True, max_length=128)

# Metrics
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    accuracy = (predictions == labels).mean()
    return {"accuracy": accuracy}


def main() -> None:
    df = load_training_dataframe()

    train_df, test_df = train_test_split(
        df,
        test_size=0.2,
        random_state=42,
        stratify=df["label"],
    )

    train_dataset = Dataset.from_pandas(train_df.reset_index(drop=True))
    test_dataset = Dataset.from_pandas(test_df.reset_index(drop=True))

    model_name = "nlpaueb/legal-bert-base-uncased"
    global tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

    train_dataset = train_dataset.map(tokenize, batched=True)
    test_dataset = test_dataset.map(tokenize, batched=True)

    training_args = TrainingArguments(
        output_dir="./model_output",
        num_train_epochs=5,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        logging_dir="./logs",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
        compute_metrics=compute_metrics,
    )

    trainer.train()
    trainer.save_model("./fine_tuned_model")
    tokenizer.save_pretrained("./fine_tuned_model")
    print("Done! Model saved to ./fine_tuned_model")


if __name__ == "__main__":
    main()
