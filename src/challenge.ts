import { Binary, Strings } from 'cafe-utility'
import {
    ChallengesRowId,
    getOnlyChallengesRowOrThrow,
    insertChallengesRow,
    updateChallengesRow
} from './database/Schema'

type Challenge = {
    id: number
    difficulty: number
    nonce: string
}

export async function createChallenge(): Promise<Challenge> {
    const difficulty = 3
    const nonce = Strings.randomHex(64)
    const id = await insertChallengesRow({ difficulty, nonce })
    return { id, difficulty, nonce }
}

export async function checkChallenge(challengeId: ChallengesRowId, challengeSolution: string) {
    const challenge = await getOnlyChallengesRowOrThrow({ id: challengeId })
    if (challenge.solution) {
        return false
    }
    const result = Binary.keccak256(
        Binary.concatBytes(Binary.hexToUint8Array(challenge.nonce), Binary.hexToUint8Array(challengeSolution))
    )
    const resultHex = Binary.uint8ArrayToHex(result)
    if (resultHex.startsWith('0'.repeat(challenge.difficulty))) {
        await updateChallengesRow(challenge.id, { solution: challengeSolution })
    } else {
        return false
    }
    return true
}
