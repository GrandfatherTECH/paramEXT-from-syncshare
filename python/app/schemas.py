from typing import Any

from pydantic import BaseModel, Field, field_validator


class ContextModel(BaseModel):
    host: str
    path: str
    fullUrl: str
    title: str = ''
    testKey: str
    participantKey: str = ''

    @field_validator('testKey')
    @classmethod
    def test_key_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('testKey must not be empty')
        return v.strip()


class OpenEduAnswerIn(BaseModel):
    answerKey: str
    answerText: str
    selected: bool = False
    correct: bool = False


class OpenEduQuestionIn(BaseModel):
    questionKey: str
    prompt: str = ''
    verified: bool = False
    isCorrect: bool = False
    answers: list[OpenEduAnswerIn] = Field(default_factory=list)

    @field_validator('questionKey')
    @classmethod
    def question_key_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('questionKey must not be empty')
        return v.strip()


class OpenEduAttemptIn(BaseModel):
    source: str = 'extension'
    context: ContextModel
    completed: bool = False
    questions: list[OpenEduQuestionIn] = Field(default_factory=list)


class QuestionQueryItem(BaseModel):
    questionKey: str
    prompt: str = ''
    answers: list[str] = Field(default_factory=list)


class OpenEduSolutionsQueryIn(BaseModel):
    context: ContextModel
    questionKeys: list[str] = Field(default_factory=list)
    questions: list[QuestionQueryItem] = Field(default_factory=list)


class LogPayloadIn(BaseModel):
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)
    system: dict[str, Any] = Field(default_factory=dict)
